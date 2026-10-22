#!/usr/bin/env bash
set -euo pipefail
image="${1:-gradhunt:ci}"
prefix="${GRADHUNT_TEST_PREFIX:-gradhunt-ci}"
[[ "$prefix" =~ ^gradhunt-[a-z0-9-]+$ ]] || exit 2
network="${prefix}-net"
db="${prefix}-db"
api="${prefix}-api"
created_db=false
created_api=false
cleanup() {
  if [ "$created_api" = true ]; then docker rm -f "$api" >/dev/null 2>&1 || true; fi
  if [ "$created_db" = true ]; then docker rm -f "$db" >/dev/null 2>&1 || true; fi
  docker network rm "$network" >/dev/null 2>&1 || true
}
# Fail on a name collision without deleting someone else's existing containers.
docker network create "$network" >/dev/null
trap cleanup EXIT
docker run -d --name "$db" --network "$network" mongo:7 >/dev/null
created_db=true
for attempt in $(seq 1 40); do
  if docker exec "$db" mongosh --quiet --eval 'quit(db.adminCommand({ping:1}).ok ? 0 : 1)' >/dev/null 2>&1; then break; fi
  sleep 1
done
docker exec "$db" mongosh --quiet --eval 'quit(db.adminCommand({ping:1}).ok ? 0 : 1)' >/dev/null
docker run -d --name "$api" --network "$network" \
  -e "MONGODB_URI=mongodb://$db:27017/gradhunt" \
  -e AUTH_SECRET=ci-only-secret-at-least-32-characters \
  -e RESUME_BUCKET=ci-placeholder-bucket \
  -e FRONTEND_URL=https://gradhunt.example.com \
  -e CLOUDWATCH_EMF=true -e ENVIRONMENT=ci "$image" >/dev/null
created_api=true
ready() {
  docker exec "$api" node -e "fetch('http://127.0.0.1:3000/api/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" >/dev/null 2>&1
}
for attempt in $(seq 1 40); do
  if ready; then break; fi
  sleep 1
done
if ! ready; then docker logs "$api"; exit 1; fi
docker exec "$api" node -e "(async()=>{
  const assert=require('node:assert/strict');
  const base='http://127.0.0.1:3000';
  assert.match(await(await fetch(base+'/')).text(), /id=\"root\"/);
  assert.match(await(await fetch(base+'/account')).text(), /id=\"root\"/);
  assert.equal((await fetch(base+'/api/auth/me')).status,401);
  assert.equal((await fetch(base+'/api/unknown')).status,404);
  const browser=await require('playwright').chromium.launch({headless:true});
  const page=await browser.newPage();
  const errors=[];
  page.on('pageerror', error=>errors.push(error.message));
  await page.route('https://cdn.jsdelivr.net/**', route=>route.abort());
  // Verify the built React bundle without invoking external scrapers.
  await page.route('**/api/jobs/search', route=>route.fulfill({
    contentType:'application/json',
    body:JSON.stringify({jobs:[],count:0,totalPages:1,currentPage:1}),
  }));
  await page.goto(base);
  await page.getByRole('heading',{name:'GradHunt',exact:true}).waitFor();
  assert.deepEqual(errors,[]);
  await browser.close();
  console.log('SPA render, API routing, auth and non-root browser launch: PASS');
})().catch(e=>{console.error(e);process.exit(1)})"
docker exec "$api" /opt/scraper/bin/python -c 'import requests, bs4; print("Python scraper imports: PASS")'
docker logs "$api" | python3 -c '
import json, sys
records = [json.loads(line) for line in sys.stdin if line.startswith("{")]
assert any(r.get("Requests") == 1 and r.get("Service") == "gateway" and "_aws" in r for r in records)
print("Mounted API request CloudWatch metrics: PASS")'
docker exec -i "$api" /opt/scraper/bin/python - <<'PY'
from zipfile import ZipFile
with ZipFile('/tmp/gradhunt-fixture.docx', 'w') as doc:
    doc.writestr('[Content_Types].xml', '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>')
    doc.writestr('_rels/.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>')
    doc.writestr('word/document.xml', '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>GradHunt portable resume parsing</w:t></w:r></w:p></w:body></w:document>')
PY
docker exec "$api" node -e "require('mammoth').extractRawText({path:'/tmp/gradhunt-fixture.docx'}).then(r=>{if(!r.value.includes('GradHunt'))process.exit(1);console.log('Linux DOCX extraction: PASS')}).catch(()=>process.exit(1))"
if [ "${RUN_LOAD:-false}" = true ]; then
  mkdir -p reports
  docker run --rm --network "$network" --user "$(id -u):$(id -g)" \
    -v "$PWD/tests/load:/scripts:ro" -v "$PWD/reports:/reports" \
    -e "BASE_URL=http://$api:3000" -e "VUS=${VUS:-5}" -e "DURATION=${DURATION:-30s}" \
    grafana/k6:1.3.0 run --summary-export=/reports/k6-summary.json /scripts/reliability.js
fi
docker stop "$db" >/dev/null
docker exec "$api" node -e "fetch('http://127.0.0.1:3000/api/health/ready').then(r=>process.exit(r.status===503?0:1)).catch(()=>process.exit(1))"
docker exec "$api" node -e "fetch('http://127.0.0.1:3000/api/health/live').then(r=>process.exit(r.status===200?0:1)).catch(()=>process.exit(1))"
docker start "$db" >/dev/null
for attempt in $(seq 1 40); do
  if ready; then break; fi
  sleep 1
done
ready
printf '%s\n' 'Database outage and automatic recovery: PASS'
docker stop --time 30 "$api" >/dev/null
test "$(docker inspect --format '{{.State.ExitCode}}' "$api")" = 0
printf '%s\n' 'SIGTERM graceful shutdown: PASS'
