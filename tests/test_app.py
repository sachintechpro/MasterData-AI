"""API and business-flow tests (stdlib only): python -m unittest discover -s tests -v."""
import json
from http.server import ThreadingHTTPServer
from pathlib import Path
import shutil
import tempfile
import threading
import unittest
from urllib.error import HTTPError
from urllib.request import Request, urlopen

import app


class MasterDataApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        cls.old_data = app.DATA
        app.DATA = Path(cls.temp.name)
        for path in app.SEEDS.glob('*.csv'):
            shutil.copyfile(path, app.DATA / path.name)
        cls.server = ThreadingHTTPServer(('127.0.0.1', 0), app.Handler)
        cls.port = cls.server.server_address[1]
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=3)
        app.DATA = cls.old_data
        cls.temp.cleanup()

    def setUp(self):
        for name in ('identity_links', 'decisions'):
            shutil.copyfile(app.SEEDS / app.FILES[name], app.DATA / app.FILES[name])

    def req(self, path, data=None):
        body = json.dumps(data).encode() if data is not None else None
        request = Request(f'http://127.0.0.1:{self.port}{path}',
                          data=body, headers={'Content-Type':'application/json'} if body else {},
                          method='POST' if data is not None else 'GET')
        try:
            with urlopen(request, timeout=4) as response:
                return response.status, response.headers, response.read()
        except HTTPError as error:
            return error.code, error.headers, error.read()

    def jsonreq(self, path, data=None):
        status, headers, response = self.req(path, data)
        return status, json.loads(response)

    def test_health_and_overview(self):
        status, health = self.jsonreq('/api/health')
        self.assertEqual(status, 200)
        self.assertEqual(health['storage'], 'CSV')
        _, view = self.jsonreq('/api/overview')
        self.assertEqual(view['counts']['golden_records'], 5)
        self.assertEqual(view['counts']['sources'], 3)

    def test_root_and_assets(self):
        for path in ('/', '/static/style.css', '/static/app.js'):
            status, _, data = self.req(path)
            self.assertEqual(status, 200)
            self.assertTrue(len(data) > 100)
        self.assertEqual(self.req('/static/../app.py')[0], 404)

    def test_about_article_and_video_placeholder(self):
        status, headers, page = self.req('/about')
        self.assertEqual(status, 200)
        self.assertIn('text/html', headers['Content-Type'])
        self.assertIn(b'For the lovers.', page)
        self.assertIn(b'And the haters.', page)
        self.assertIn(b'data-youtube-url=""', page)
        self.assertIn(b'Choose your route', page)
        self.assertIn(b'role="tablist"', page)
        for path in ('/static/about.css', '/static/favicon.svg'):
            status, _, content = self.req(path)
            self.assertEqual(status, 200)
            self.assertGreater(len(content), 100)
        _, _, main = self.req('/')
        self.assertIn(b'href="/about"', main)

    def test_suggests_known_candidates(self):
        status, matches = self.jsonreq('/api/matches')
        self.assertEqual(status, 200)
        self.assertEqual({m['source_id'] for m in matches}, {'PC-204','PC-205','BC-305'})
        self.assertTrue(all(m['review_required'] for m in matches))

    def test_approve_joins_transactions_and_provenance(self):
        _, before = self.jsonreq('/api/masters/MDM-1005')
        self.assertEqual(before['policies'], [])
        status, event = self.jsonreq('/api/matches/decision', {
            'golden_id':'MDM-1005','source':'policy','source_id':'PC-205','decision':'approved'})
        self.assertEqual(status, 200)
        self.assertTrue(event['success'])
        _, after = self.jsonreq('/api/masters/MDM-1005')
        self.assertEqual(len(after['policies']),2)
        self.assertEqual(len(after['claims']),2)
        self.assertEqual(after['provenance']['full_name']['system'], 'Salesforce CRM')
        self.assertEqual(len(after['linked_sources']),2)
        self.assertGreaterEqual(len(after['conflicts']),1)

    def test_billing_link_changes_answer(self):
        _, before = self.jsonreq('/api/ask',{'customer_id':'MDM-1005','question':'Any unpaid invoices?'})
        self.assertIn('No invoices', before['reply'])
        self.jsonreq('/api/matches/decision',{'golden_id':'MDM-1005','source':'billing','source_id':'BC-305','decision':'approved'})
        _, after = self.jsonreq('/api/ask',{'customer_id':'MDM-1005','question':'Any unpaid invoices?'})
        self.assertIn('2 invoice(s)', after['reply'])
        self.assertIn('invoices.csv',str(after['evidence']))
        self.assertTrue(after['trace'])

    def test_rejected_candidate_is_excluded(self):
        status,_ = self.jsonreq('/api/matches/decision',{'golden_id':'MDM-1004','source':'policy','source_id':'PC-204','decision':'rejected'})
        self.assertEqual(status,200)
        _, remaining=self.jsonreq('/api/matches')
        self.assertNotIn('PC-204',[m['source_id'] for m in remaining])
        self.assertEqual(len(app.read_csv('decisions')),1)

    def test_double_approval_is_conflict(self):
        payload={'golden_id':'MDM-1005','source':'billing','source_id':'BC-305','decision':'approved'}
        self.assertEqual(self.jsonreq('/api/matches/decision',payload)[0],200)
        self.assertEqual(self.jsonreq('/api/matches/decision',payload)[0],409)

    def test_reject_invalid_decision_and_unknown_customer(self):
        self.assertEqual(self.jsonreq('/api/matches/decision',{'decision':'merge'})[0],400)
        self.assertEqual(self.jsonreq('/api/masters/MDM-NOT-FOUND')[0],404)
        self.assertEqual(self.jsonreq('/api/ask',{'customer_id':'BAD','question':'claims'})[0],400)
        self.assertEqual(self.jsonreq('/api/ask',{'customer_id':'MDM-1001','question':''})[0],400)

    def test_csv_export_and_unknown_source(self):
        status,headers,body=self.req('/api/sources/crm/download')
        self.assertEqual(status,200)
        self.assertIn('attachment',headers['Content-Disposition'])
        self.assertIn(b'CRM-101',body)
        self.assertEqual(self.jsonreq('/api/sources/secrets')[0],404)

    def test_matching_requires_dob_and_contact(self):
        a=app.read_csv('crm')[0]
        b=app.read_csv('policy')[1]
        self.assertFalse(app.score_match(a,b)[3])
        c=app.read_csv('policy')[0]
        self.assertGreaterEqual(app.score_match(a,c)[0],70)

    def test_reset_restores_initial_links(self):
        payload={'golden_id':'MDM-1005','source':'policy','source_id':'PC-205','decision':'approved'}
        self.jsonreq('/api/matches/decision',payload)
        self.assertEqual(len(app.read_csv('decisions')),1)
        status,result=self.jsonreq('/api/reset',{})
        self.assertEqual(status,200)
        self.assertTrue(result['success'])
        self.assertEqual(len(app.read_csv('decisions')),0)
        self.assertEqual(len(app.read_csv('identity_links')),11)

    def test_on_demand_qa(self):
        status,result=self.jsonreq('/api/tests/run')
        self.assertEqual(status,200)
        self.assertEqual(result['passed'],result['total'])
        self.assertGreaterEqual(result['total'],10)


if __name__ == '__main__':
    unittest.main()
