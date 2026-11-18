# Issue tracker: GitHub

Issues and specs live in GitHub Issues for `JulioLeonPhd/herdr-workspace-status`. Use `gh` from this repo. Before writing, verify the target with `gh repo view --json nameWithOwner`; use `-R JulioLeonPhd/herdr-workspace-status` to disambiguate.

- Publish: `gh issue create --title "..." --body "..."`.
- Fetch: `gh issue view <number> --json number,title,body,labels,comments`.
- List: `gh issue list --state open`; filter with `--label` as needed.
- Link parent and child via native sub-issues and blockers via native issue dependencies. If unavailable, put `Part of #<parent>` or `Blocked by: #<number>` at the top of the child body. A ticket is unblocked when all blockers are closed.
- Triage: use `gh issue comment` and `gh issue edit --add-label` or `--remove-label`. When closing, post the explanation before `gh issue close`.

## Pull requests as a triage surface

**PRs as a request surface: no.**
