const fs = require('node:fs/promises');
const path = require('node:path');
const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');

const validName = name => typeof name === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,240}$/.test(name);
const createResumeStorage = ({ bucket = process.env.RESUME_BUCKET,
  directory = path.join(__dirname, '../uploads/resumes'), client } = {}) => {
  let s3 = client;
  const storage = () => s3 ||= new S3Client({});
  const validate = name => {
    if (!validName(name)) throw Object.assign(new Error('Invalid resume filename'), { statusCode: 400 });
  };
  return {
    async write(name, data) {
      validate(name);
      if (bucket) {
        await storage().send(new PutObjectCommand({ Bucket: bucket, Key: `resumes/${name}`,
          Body: data, ContentType: 'application/octet-stream', ServerSideEncryption: 'AES256' }),
        { abortSignal: AbortSignal.timeout(10000) });
      } else {
        if (process.env.NODE_ENV === 'production') throw new Error('RESUME_BUCKET is required in production');
        await fs.mkdir(directory, { recursive: true });
        await fs.writeFile(path.join(directory, name), data, { mode: 0o600 });
      }
    },
    async read(name) {
      validate(name);
      if (bucket) {
        const result = await storage().send(new GetObjectCommand({ Bucket: bucket, Key: `resumes/${name}` }),
          { abortSignal: AbortSignal.timeout(10000) });
        return Buffer.from(await result.Body.transformToByteArray());
      }
      if (process.env.NODE_ENV === 'production') throw new Error('RESUME_BUCKET is required in production');
      return fs.readFile(path.join(directory, name));
    },
  };
};
// Resolve environment lazily so dotenv is loaded before configuration is used.
const writeResume = (name, data) => createResumeStorage().write(name, data);
const readResume = name => createResumeStorage().read(name);
module.exports = { createResumeStorage, writeResume, readResume };
