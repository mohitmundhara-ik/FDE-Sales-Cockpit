# tools

Not deployed. `.vercelignore` keeps this folder out of the build, and a stray
`.py` at the repo root would otherwise make Vercel try to detect a Python project.

## regen_jobs.py

Rebuilds the cockpit's job dataset from a raw LinkedIn scrape. Run it whenever a
fresh scrape lands, then paste the output into the cockpit's `const JOBS=` block.

    pip install openpyxl
    python3 tools/regen_jobs.py path/to/scrape.xlsx --out JOBS.json

The workbook needs two sheets: one whose name contains "FDE" or "Forward", and one
named "Adjacent". Everything else is derived from `descriptionText`, so no manual
tagging is needed.

It prints what it produced:

    raw    : {'Core FDE': 661, 'Adjacent': 1870}
    unique : {'Core FDE': 661, 'Adjacent': 1870}  (total 2531)
    roles  : {'Core FDE': 284, 'Adjacent': 1656}  (repeat postings collapsed)

`unique` counts postings. `roles` collapses the same opening re-posted several
times. The cockpit shows both, because a role advertised three times is one job.

### Rules it applies, so they are not a black box

- **India scope** by city and state vocabulary as well as the word India, because
  LinkedIn writes "Greater Bengaluru Area" and never says the country.
- **Level** from a seniority word in the title first; with none, the years stated
  in the posting decide (0-2 or unstated is Associate, 3 or more is Mid).
- **Employer tier** from a named-company list first, then employee count and
  industry.
- **Blocks and stack** from keyword sets over the full description text. A block
  counts as asked-for when the posting names at least one of its signals.

### After regenerating

1. Replace the `const JOBS=` payload in `public/index.html`.
2. Update the scrape date wherever it appears in the copy.
3. Re-check the adjacent-to-core ratio, which the cockpit quotes in several places.
