Type: task
Status: open
Blocked by: 01, 02, 03, 04, 05, 06, 07, 08, 14, 15, 16, 17

# The spec, and the binding documents amended

## Question

This is the destination. With every decision taken, assemble what a build session needs and
nothing it does not:

1. **`.scratch/agents-and-chats/spec.md`**: the model (from 01 to 05), the cards (06), creation
   (07, 15, 16), compaction (08), access (14), the schema (17), each as a pointer to the ticket
   that holds the reasoning plus the sentence a builder needs. Then the **build order**, in the
   spirit of the first demo's *build order starts with the mock*: schema and domain first,
   then the orchestrator's grain, then adapters' persona and workspace changes, then the UI
   against `MockAgentRuntime`, then live on each runtime. Each step names its done-when.
2. **`CONTEXT.md`**: every entry ticket 01 wrote, checked against 02 to 05 and 14 for drift.
3. **`docs/adr/`**: ADR-0006 written (01); ADR-0001, 0002, 0003 amended (01, 05, 14).
4. **`DESIGN.md`**: the marked-up version from 15 applied, with 16's screen descriptions.
5. **`CLAUDE.md`**: the Git-aware rule reworded (02); the *Current work* section pointed at
   this effort; the first-demo paragraph marked as the version before this.
6. **The reopened tickets** named in the map's Notes each carry an amendment section pointing
   here, so no session reads an old answer as final.
7. **`.scratch/agents-and-chats/build.md`** opened empty but for the build order and the clean
   break note, for the first build session to fill.

Nothing here is built. The answer is the list of files written and the commit that holds them,
and the map's Destination line marked *reached*.
