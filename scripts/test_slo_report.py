import unittest
from slo_report import report

class SLOReportTests(unittest.TestCase):
    def test_empty_traffic_is_inconclusive(self):
        with self.assertRaises(ValueError):
            report({'metrics': {}})

    def sample(self, failures=0):
        return {'metrics': {
            'api_requests': {'values': {'count': 1000}},
            'api_failures': {'values': {'rate': failures}},
            'api_latency': {'values': {'p(95)': 100}},
        }}

    def test_good_sample_passes(self):
        self.assertTrue(report(self.sample())[1])

    def test_real_k6_summary_export_shape(self):
        sample = {'metrics': {
            'api_requests': {'count': 150}, 'api_failures': {'value': 0},
            'api_latency': {'p(95)': 14.05}, 'checks': {'passes': 300, 'fails': 0},
        }}
        self.assertTrue(report(sample)[1])
        sample['metrics']['checks']['fails'] = 1
        self.assertFalse(report(sample)[1])

    def test_error_budget_breach_fails(self):
        self.assertFalse(report(self.sample(0.01))[1])

    def test_readiness_check_failure_fails(self):
        data = self.sample()
        data['metrics']['checks'] = {'values': {'fails': 1}}
        self.assertFalse(report(data)[1])

if __name__ == '__main__':
    unittest.main()
