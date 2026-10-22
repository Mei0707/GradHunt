import unittest
from cloudwatch_slo import evaluate

class CloudWatchSLOTests(unittest.TestCase):
    def test_no_traffic_is_not_perfect_availability(self):
        with self.assertRaises(ValueError):
            evaluate([])

    def test_counts_aborted_requests_as_failures(self):
        result = evaluate([{'Id': 'requests', 'Values': [1000]},
                           {'Id': 'errors', 'Values': [1]}, {'Id': 'aborts', 'Values': [1]}])
        self.assertEqual(result['failures'], 2)
        self.assertAlmostEqual(result['success_percent'], 99.8)
        self.assertEqual(result['remaining_error_budget'], -1)

    def test_incomplete_error_stream_is_inconclusive(self):
        with self.assertRaises(ValueError):
            evaluate([{'Id': 'requests', 'Values': [1000]}])

if __name__ == '__main__':
    unittest.main()
