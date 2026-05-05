# LOGBOOK PDF FULL CONTENT + FIELD MAPPING

This file reproduces all extracted text from `LogBook.pdf` (normalized) and adds `FILL:` guidance lines for every blank/placeholder area so you can transfer EXACT wording plus your project-specific entries. Keep handwritten where your instructions mandate.

---
## COVER & INSTRUCTIONS
SCHOOL OF INFORMATION AND SYSTEM TECHNOLOGY.
STUDENT'S PROJECT LOG-BOOK  
APT/SWE__________________  
FILL: Enter course code (e.g., SWE ### or APT ###).

STUDENT NAME:  
FILL: <Surname, First Middle>

DURATION: 12 WEEKS  
FILL: Start: 05 Aug 2025  End: 27 Oct 2025 (adjust to official academic calendar).

DAILY REPORT  
The daily work carried out during the period of PROJECT is to be recorded clearly with sketches and diagrams where applicable on the logbook. This must be HANDWRITTEN NOT WEEKLY.  
FILL: Use the daily tables below; replicate sample Week 1 entries. Continue handwritten for authenticity.

WEEKLY SUMMARY REPORT  
Take weekly photo or scan and upload on BB logbook section. For the previous weeks use your proposal and design process items to update your weekly items.  
FILL: Provide one paragraph summary per week (see samples under each week).

REPORT WRITING  
In addition to the daily and weekly record, the student should submit a report of the work done during the Project. e.g full coverage of the project course, problems encountered etc. A comprehensive guide on report writing is provided by the supervisor on blackboard.  
FILL: Planned sections: Abstract; Introduction; Problem; Objectives; Design & UML; Implementation; Testing; Results; Challenges; Future Work; Conclusion.

N/B: Note those who don’t submit on Blackboard on time OR wrong uploads are graded 0, late submission 5/10 even after presenting. Ensure you submit on Blackboard and daily manually update log book report. Ensure you are attending all classes and complying with weekly activities for any grading to be considered. Online Screenshot evidence and physical attendance for SWE will be used to verify student work.  
FILL: Acknowledge compliance: "All daily entries updated and weekly scans uploaded by deadlines." (Handwritten remark optional.)

REPORT SUBMISSION  
The logbook and report must be submitted to the project course supervisor at the end of the Project. Attach the letter from the employment that granted you the Project vacancy indicating when the Project started and when it will end. The Log-Book should be well bound.  
FILL: "Letter of placement attached (if applicable). Final submission target: 27 Oct 2025."

---
## STUDENT’S PERSONAL INFORMATION
Name of student .......................................................... (Surname first)  
FILL: <Surname, First Middle>

Registration No. of the student ...........................................  
FILL: <Reg Number>

Faculty ........................................ Course of Study .......................................  
FILL: School of Science & Technology | BSc Software Engineering

Stage/year of study .................................. Name and Project undertaking ............  
FILL: Year 3 / Sem 2 | "USIU Campus Map Navigator & Collaborative Utilities"

...............................................................................................................  
FILL: Short descriptor: "Interactive mapping + group routing + task boards + lost & found + emergency routing"

...............................................................................................................  
FILL: Optional tagline: "Enhancing navigation, collaboration, safety"

Name of Project supervisor ....................................................  
FILL: <Supervisor Name>

...............................................................................................................  
FILL: Supervisor email (if allowed) or leave blank.

Mobile .......................................  
FILL: <Your contact> (if permitted) else leave blank.

Duration of the Project:  
FILL: 12 Weeks (05 Aug – 27 Oct 2025)

---
## WEEKLY PROGRESS CHART – PROPOSED SYSTEM (FINAL SYSTEM)
Proposed System features.  
∟ .  
∟ .  
∟ .  
∟ .  
∟ .  
FILL (List 5–6 core final features):
1. Interactive Mapbox campus map + POI search
2. Walkway shortest-path routing (Dijkstra)
3. Group navigation (shared session, presence, synchronized routes)
4. Kanban task boards (assignments, progress states)
5. Lost & found reporting & claim workflow
6. Emergency hazard-aware routing (weighted risk)

---
## WEEK ONE: Project CONCEPTUALIZATION
DAY | DESCRIPTION OF WEEKLY ACTIVITIES | NEW SKILLS LEARNT
Mon. | (If started later leave blank or ideation) | Project scoping & requirement consolidation
Tue. | Initialize React+TypeScript project, integrate Mapbox token & map render | Mapbox GL initialization, environment config
Wed. | Implement geolocation hook (watchPosition) & manual override | Browser geolocation API patterns, accuracy handling
Thur. | Curate POI dataset; create search scoring utility | Data modeling, basic relevance scoring
Fri. | Build walkway graph; implement Dijkstra shortest path | Graph representation & routing algorithm application
Sat. | Refactor components (POISearch, RoutePanel), add error boundary | Component architecture & error isolation
Sun. | Replace DOM markers with GeoJSON circle layer; add diagnostics script | Vector layer styling, runtime validation scripting

TRAINEE’S WEEKLY REPORT (Week 1 Summary)  
FILL: "Established project scaffold and core geospatial infrastructure (map, POIs, routing, geolocation). Verified baseline performance and prepared for design phase."  
Supervisor Comments (blank for supervisor): ____________________

---
## WEEK TWO: Project PROPOSAL – Use your objectives
Main Objective:  
FILL: "Deliver an integrated campus platform combining navigation, collaboration, asset recovery, and emergency routing."

Clear system objectives [Ensure weekly activities match]:  
∟ Provide interactive map & POI search (baseline)  
∟ Shortest-path routing between user & POI  
∟ Group session presence & synchronized routing  
∟ Task boards with assignment & status flow  
∟ Lost & found reporting & claims  
∟ Emergency hazard-aware routing & risk weighting

DAY | DESCRIPTION OF WEEKLY ACTIVITIES | NEW SKILLS LEARNT
Mon. | Formalize objectives & success metrics | Objectives traceability, metrics definition
Tue. | Draft high-level architecture diagrams (modules, data flow) | UML component modeling
Wed. | Define data models (Session, Task, LostItem, HazardEdge) | Schema design, model normalization
Thur. | Prioritize backlog & implementation phases (roadmap) | Roadmapping & risk staging
Fri. | Validation planning (unit & E2E test matrix) | Test strategy design

Week 2 Summary:  
FILL: "Completed detailed proposal: architecture, data models, phased roadmap, testing and risk plan."  
Supervisor Comments: ____________________

Tools used for UML design:  
FILL: diagrams.net (Draw.io), PlantUML (text-based), optional Lucidchart.

UML interactions:  
FILL: Sequence: User → SessionService (create) → Presence updates broadcast; LostItem submission → Storage → Listing Retrieval; Hazard update → HazardChannel → Recompute route.

---
## WEEK THREE: Project UML AND SYSTEM DESIGN
DAY | DESCRIPTION | NEW SKILLS
Mon. | Detailed UML class diagrams for data models | Class decomposition
Tue. | Sequence diagrams for group presence & hazard update flows | Event-driven modeling
Wed. | State diagrams for Task and Lost/Found item lifecycle | Finite state thinking
Thur. | Define API contracts & validation schemas (Zod stubs) | Contract-first design
Fri. | Performance & accessibility design considerations documented | A11y planning, perf budgeting

Week 3 Summary:  
FILL: "Produced comprehensive UML set (class, sequence, state) and validation blueprint supporting upcoming implementation."  
Supervisor Comments: ____________

---
## WEEK FOUR: Project DESIGN / DATASET / DATABASE
Describe briefly your design activities (bullets):
∟ Extended walkway graph attribute plan (riskLevel, accessible)  
∟ POI augmentation (retrievalPoint flags)  
∟ Data persistence choice (Firestore vs WebSocket fallback)  
∟ Draft Firestore collections & security rule outline  
∟ Route caching strategy (memo keys + hazard version)  
∟ Offline caching manifest plan

DAY | DESCRIPTION | NEW SKILLS
Mon. | Augment graph design & hazard attribute taxonomy | Multi-criteria routing modeling
Tue. | Firestore collection schema draft (tasks, sessions, items) | Cloud data structuring
Wed. | Security rules outline (ACL, presence TTL) | Access control planning
Thur. | Service worker offline asset & POI caching plan | PWA offline strategies
Fri. | Route cache & performance estimation worksheet | Algorithmic optimization planning

Week 4 Summary:  
FILL: "Finalized data expansion strategies and persistence/security design; prepared for feature implementation."  
Supervisor Comments: ____________

---
## WEEK FIVE: PROGRESS REPORTING #1
Focus: Lost & Found Module MVP
DAY | DESCRIPTION | NEW SKILLS
Mon. | Implement LostItem + FoundItem forms (client mock) | Form design, validation
Tue. | Local image attachment handling & preview | File handling
Wed. | Listing & filter UI (category, POI filter) | UI state management
Thur. | Claim initiation flow mock | Workflow modeling
Fri. | Status transitions & resolution logic (client-side) | State machine application

Week 5 Summary:  
FILL: "Lost & Found UI prototype functional end-to-end (mock layer) enabling future backend wiring."  
Supervisor Comments: ____________

---
## WEEK SIX: PROGRESS REPORTING #2
Focus: Group Navigation Presence
DAY | DESCRIPTION | NEW SKILLS
Mon. | Session create/join UI & code generation | Collaboration UX
Tue. | Presence broadcast mock (interval updates) | Realtime simulation
Wed. | Per-member shortest path computation & polyline overlay | Multi-route optimization
Thur. | Shared target & dynamic re-route logic | Event-driven recompute
Fri. | Overlapping segment highlight algorithm | Graph edge intersection

Week 6 Summary:  
FILL: "Group session & presence simulation working; synchronized route visualization complete."  
Supervisor Comments: ____________

---
## WEEK SEVEN: PROGRESS REPORTING #3
Focus: Task Boards (Kanban)
DAY | DESCRIPTION | NEW SKILLS
Mon. | Board & column CRUD UI | CRUD architecture
Tue. | Task creation & assignment feature | Ownership modeling
Wed. | Drag & drop ordering with fractional indices | Ordering algorithms
Thur. | Activity log integration | Audit logging
Fri. | Basic filtering & tag chips | UI filtering patterns

Week 7 Summary:  
FILL: "Kanban board with real-time state management and activity logging completed."  
Supervisor Comments: ____________

---
## WEEK EIGHT: PROGRESS REPORTING #4
Focus: Emergency Routing Engine
DAY | DESCRIPTION | NEW SKILLS
Mon. | HazardEdge ingestion model & subscription mock | Dynamic data ingestion
Tue. | Weighted Dijkstra (risk + accessibility penalties) | Multi-criteria pathfinding
Wed. | Fallback route detection (all safe blocked) | Graceful degradation
Thur. | Route color coding (risk visualization) | Data-driven styling
Fri. | Performance profiling & optimization | Profiling methodology

Week 8 Summary:  
FILL: "Weighted routing & hazard visualization operational; fallback warnings implemented."  
Supervisor Comments: ____________

---
## WEEK NINE: PROGRESS REPORTING #5
Focus: Accessibility & Offline
DAY | DESCRIPTION | NEW SKILLS
Mon. | Keyboard navigation and focus management | A11y interaction patterns
Tue. | ARIA roles & semantic labeling | Inclusive design
Wed. | High-contrast & reduced-motion modes | Theming/accessibility settings
Thur. | Service worker asset + POI caching implementation | Offline caching
Fri. | Offline mutation queue framework | Sync resilience

Week 9 Summary:  
FILL: "Accessibility baseline achieved and offline caching with queued mutations implemented."  
Supervisor Comments: ____________

---
## WEEK TEN: PROGRESS REPORTING #6
Focus: Testing & Quality
DAY | DESCRIPTION | NEW SKILLS
Mon. | Unit tests for routing & search | Algorithm test design
Tue. | Component tests (POISearch, RoutePanel) | React Testing Library usage
Wed. | Integration tests (session + presence) | Cross-module validation
Thur. | Cypress E2E baseline suite | E2E automation
Fri. | CI pipeline (lint, test, build) setup | Continuous integration

Week 10 Summary:  
FILL: "Comprehensive automated test suite and CI pipeline established."  
Supervisor Comments: ____________

---
## WEEK ELEVEN: PROGRESS REPORTING #7 – REPORT PREPARATION & DOCUMENTATION
DAY | DESCRIPTION | NEW SKILLS
Mon. | Draft Abstract & Introduction | Technical writing
Tue. | Draft Design & Implementation chapters | Documentation structure
Wed. | Draft Testing & Results sections | Evidence synthesis
Thur. | Draft Future Work & Conclusion | Strategic articulation
Fri. | Proofread, diagram polish, bibliography | Editing & refinement

Week 11 Summary:  
FILL: "Draft report near-final; all sections populated pending supervisor feedback."  
Supervisor Comments: ____________

---
## WEEK TWELVE: PROGRESS REPORTING #8 – FINAL PROJECT FINALIZATION
DAY | DESCRIPTION | NEW SKILLS
Mon. | Final integration & regression pass | Release readiness
Tue. | Address supervisor feedback | Iterative improvement
Wed. | Prepare presentation/demo assets | Communication refinement
Thur. | Final report + logbook compilation | Packaging & compliance
Fri. | Submission & retrospective notes | Post-mortem analysis

Week 12 Summary:  
FILL: "All deliverables finalized, submitted, and retrospective documented for knowledge capture."  
Supervisor Comments: ____________

---
## SIGNATURE BLOCK TEMPLATE (REPEAT PER WEEK)
NAME OF THE SUPERVISOR: _______________________________  
DEPARTMENT/UNIT: ______________________________________  
DATE: _______________  SIGNATURE: ________________________

(Place this under each weekly summary per template pages.)

---
## OPTIONAL APPENDIX ENTRIES (If margins allow)
Placement Letter Attached: Yes/No  
Handwritten Compliance Note: "Daily entries maintained contemporaneously."  
Attendance Evidence: "Screenshots & physical attendance logs kept."  

---
## DAILY ENTRY QUICK REFERENCE (Week 1 Provided)
Copy the format exactly; leave future days for real daily writing to comply with rule that the log is handwritten.

---
End of Full Mapping.
