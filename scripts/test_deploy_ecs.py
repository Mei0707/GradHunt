import json
import os
import unittest
from unittest.mock import patch
import deploy_ecs

OLD = 'arn:aws:ecs:us-west-2:111111111111:task-definition/gradhunt:1'
NEW = 'arn:aws:ecs:us-west-2:111111111111:task-definition/gradhunt:2'
ENV = {'ECS_CLUSTER': 'cluster', 'ECS_SERVICE': 'service', 'TASK_FAMILY': 'gradhunt',
       'IMAGE_URI': '111111111111.dkr.ecr.us-west-2.amazonaws.com/gradhunt@sha256:' + 'a' * 64,
       'LOG_GROUP': '/gradhunt/production/gateway', 'AWS_REGION': 'us-west-2', 'RESUME_BUCKET': 'gradhunt-uploads',
       'FRONTEND_URL': 'https://gradhunt.example.com'}


def state(arn=OLD):
    return {'services': [{'taskDefinition': arn, 'desiredCount': 2, 'runningCount': 2, 'pendingCount': 0,
                         'deployments': [{'status': 'PRIMARY', 'rolloutState': 'COMPLETED'}]}]}


class DeployTests(unittest.TestCase):
    def fake_aws(self, rollback=False):
        self.calls = []
        self.describes = 0
        def invoke(*args):
            self.calls.append(args)
            if args[:2] == ('ecs', 'describe-services'):
                self.describes += 1
                return state(OLD if self.describes == 1 or rollback else NEW)
            if args[:2] == ('ecs', 'describe-task-definition'):
                return {'taskDefinition': {'family': 'gradhunt', 'taskDefinitionArn': OLD, 'revision': 1,
                    'containerDefinitions': [{'name': 'gateway', 'image': 'old',
                        'environment': [{'name': 'TRUST_PROXY_HOPS', 'value': '2'}, {'name': 'TRUST_PROXY', 'value': 'true'}],
                        'secrets': [{'name': 'MONGODB_URI'}, {'name': 'AUTH_SECRET'}]},
                        {'name': 'sidecar', 'image': 'unchanged'}]}}
            if args[:2] == ('ecs', 'register-task-definition'):
                with open(args[3].removeprefix('file://')) as f:
                    self.payload = json.load(f)
                return {'taskDefinition': {'taskDefinitionArn': NEW}}
            return {}
        return invoke

    @patch.dict(os.environ, ENV, clear=True)
    def test_success_verifies_requested_revision_and_preserves_sidecar(self):
        with patch.object(deploy_ecs, 'aws', side_effect=self.fake_aws()):
            deploy_ecs.deploy()
        self.assertNotIn('revision', self.payload)
        self.assertEqual(self.payload['containerDefinitions'][0]['image'], ENV['IMAGE_URI'])
        self.assertEqual(self.payload['containerDefinitions'][1]['image'], 'unchanged')
        self.assertIn({'name': 'TRUST_PROXY_HOPS', 'value': '2'}, self.payload['containerDefinitions'][0]['environment'])
        self.assertIn({'name': 'TRUST_PROXY', 'value': 'true'}, self.payload['containerDefinitions'][0]['environment'])
        self.assertEqual(self.describes, 2)

    @patch.dict(os.environ, ENV, clear=True)
    def test_ecs_auto_rollback_is_reported_as_failure_and_previous_revision_restored(self):
        with patch.object(deploy_ecs, 'aws', side_effect=self.fake_aws(rollback=True)):
            with self.assertRaisesRegex(RuntimeError, 'rolled back'):
                deploy_ecs.deploy()
        updates = [args for args in self.calls if args[:2] == ('ecs', 'update-service')]
        self.assertEqual(updates[-1][-1], OLD)

    @patch.dict(os.environ, ENV, clear=True)
    def test_rejects_mutable_image_before_any_aws_calls(self):
        with patch.dict(os.environ, {'IMAGE_URI': 'repo:latest'}), patch.object(deploy_ecs, 'aws') as aws:
            with self.assertRaises(ValueError):
                deploy_ecs.deploy()
            aws.assert_not_called()

    @patch.dict(os.environ, ENV, clear=True)
    def test_rejects_an_unstable_service_before_registering_a_revision(self):
        unstable = state()
        unstable['services'][0]['runningCount'] = 0
        with patch.object(deploy_ecs, 'aws', return_value=unstable) as aws:
            with self.assertRaisesRegex(RuntimeError, 'stable'):
                deploy_ecs.deploy()
            self.assertEqual(aws.call_count, 1)

if __name__ == '__main__':
    unittest.main()
