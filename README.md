# MasterData AI · SachinTechpro

**One customer. One clear picture.** An interactive enterprise master-data-management (MDM) demo with a friendly, minimal consumer-app interface. Source of truth for this demonstration: **CSV files only**.

## What to try

1. Open **Customer 360** → select **Michael Johnson**. Initially, only CRM identity information is linked. Policies, claims, and bills are not shown because the policy and billing identities are unapproved.
2. Open **Match review** → review `PC-205` (Mike Johnson) and `BC-305` (Michael Johnson). Examine name/email differences, evidence, and match scores. Approve a link.
3. Return to **Customer 360**. Now policies, claims, and/or invoices appear from the linked source. Original source IDs and field-level provenance remain visible.
4. Open **Ask data** → ask **“Any open claims?”**, **“Any unpaid invoices?”**, **“Where did this information come from?”**. The response is grounded in linked CSV rows, with an auditable trace.
5. Open **Data & QA** → inspect or download CSV files, run ten integrity checks, and reset the sample review.

Another useful case is **Helena Ortiz**: the same phone, email, and birth date, but a different source address. Approving the proposed match retains the discrepancy for review.

## Technology

- **Frontend:** Vanilla JavaScript, HTML5, CSS3. Mobile responsive, semantic controls, no build step.
- **Backend:** Python 3.11+ standard-library HTTP service. No external packages or relational database.
- **Storage:** CSV files in `/data` (`csv.DictReader` / `csv.DictWriter`), including persisted demonstration match approvals.
- **Matching:** Explainable deterministic scoring (DOB 25, email 30, phone 25, normalized address 12, name similarity up to 8); requires birth-date equality plus matching email or phone. No automatic merge.
- **Golden record:** Stable `MDM-` identifier and cross-reference in `identity_links.csv`; CRM-first field survivorship, field provenance and conflict detection.
- **Transactions:** Policies, claims, and invoices stay in their source CSVs. They are joined only for linked customer identities.
- **Assistant:** Guided, rules-based natural-language keyword router with linked CSV evidence and a technical trace. **With no API key it is not a live LLM**, and is explicitly labeled in the UI. Optionally, configure `OPENAI_API_KEY` and `OPENAI_MODEL` (default: `gpt-6-luna`) to enable real read-only AI synthesis via the Responses API. The model receives only the selected fictional customer snapshot; CSV files remain the sole business data store. Model-generated text may be wrong and should be checked against the displayed source evidence.
- **Testing:** Python `unittest` API and end-to-end business-flow checks; browser-visible on-demand integrity suite.

## Run locally

Requires Python 3.11+ and nothing else.

```bash
python app.py
# Open http://localhost:5000
```

Run automated tests:

```bash
python -m unittest discover -s tests -v
```

The app has a health endpoint at `/api/health`.

## CSV model

| File | Description |
|---|---|
| `crm_customers.csv` | CRM customer identities |
| `policy_customers.csv` | Insurance policy-system customer identities |
| `billing_customers.csv` | Billing-system customer identities |
| `identity_links.csv` | Stable master ID → source system / source ID crosswalk |
| `policies.csv` | Policies, products, status, premium and renewal |
| `claims.csv` | Claims linked to policy IDs |
| `invoices.csv` | Bills linked to billing identities |
| `decisions.csv` | Reviewer approvals/rejections and timestamps |

`.seed-data/` contains original sample CSV files. Only review-linked CSVs are changed through the UI, and **Reset sample demo** restores those two files. To change the sample dataset, edit the CSVs and their corresponding seed files. Real person or company data must not be placed in a public repository.

## API

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/overview` | Current source and identity counts |
| GET | `/api/masters` | Mastered customer summaries |
| GET | `/api/masters/{id}` | Customer 360 with provenance, policies, claims and invoices |
| GET | `/api/matches` | Eligible unreviewed identity candidates |
| POST | `/api/matches/decision` | Approve or reject a source identity link |
| POST | `/api/ask` | Rule-grounded, source-cited question answering |
| GET | `/api/sources/{table}` | CSV contents, for an allowlisted table |
| GET | `/api/sources/{table}/download` | CSV export |
| POST | `/api/reset` | Restore sample identity links and decisions |
| GET | `/api/tests/run` | Run ten live integrity checks |

Example question request:

```json
{"customer_id":"MDM-1005","question":"Any open claims?"}
```

## Deploy on Render

1. Push this project into a new public GitHub repository (suggested: `sachintechpro/MasterData-AI`).
2. In Render, use **New → Blueprint**, select the repository and its `render.yaml`; choose the free service if available.
3. Render starts the app with `python app.py`, with no build dependencies.
4. Verify `/api/health`, try a match approval, then use **Data & QA** to run checks.

### Important demonstration limitations

This is a public, fictional-data sandbox—not an operational MDM platform. There is no authentication/authorization enforcement, production audit security, enterprise connector integration, or full stewardship queue. LLM inference is optional, not enabled by default. Match scores are illustrative rules and require human review. Do **not** load personal data into it.

On Render's free web service, the **local filesystem is ephemeral**: CSV changes made via the demo are not durable across service redeploys/restarts or new instances. Multiple viewers share demonstration state while the same instance runs. For durable write persistence later, use a persistent disk on a supported paid plan or switch to durable storage—this proof of concept intentionally keeps CSV only.

## Intended portfolio positioning

Shows enterprise data modeling, API joins, customer identity matching, conflict detection, provenance, source-grounded question answering, lifecycle states, functional testing and UI/UX design. It is a **controlled simulation of MDM integration**, not a claim that a commercial MDM product or live Guidewire/Salesforce/SAP connector is implemented.

---

Created for the **SachinTechpro** public demo portfolio. Original interface inspired by the clarity and simplicity of modern consumer insurance experiences; no third-party brand assets are used.

### Optional AI connection

Set `OPENAI_API_KEY` as a **secret Render environment variable**, not in source control or a CSV. Optionally set `OPENAI_MODEL`. Without it, Ask Data uses the transparent guided-answer mode. When configured, the external model receives the selected fictional customer snapshot to generate a read-only answer. The model must not be given real customer data in this public sandbox.
