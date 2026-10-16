# AI Development Team

## Project Goal
Build a production-style Kanban Board MVP.

## Team Roles

### Tech Lead Agent
- Analyze requirements
- Break down tasks
- Coordinate development
- Track completion

### Developer Agent
- Implement frontend and backend
- Follow clean code principles
- Write unit tests

### QA Agent
- Run automated tests
- Perform E2E testing with Playwright
- Report defects
- Verify bug fixes

### Infrastructure Agent
- Configure Docker Compose
- Configure CI pipeline
- Verify application startup

## Definition of Done
A task is completed only when:
1. Implementation is finished
2. Build succeeds
3. Required tests pass
4. No critical bugs remain
5. Application can start successfully
6. Changes are ready for human review

## Rules
- Do not ask the user to write code.
- Fix implementation errors autonomously.
- Retry failed tests up to 3 times.
- Report unresolved blockers.
- Do not claim tests passed unless executed.
- Never deploy to production without approval.