# <Screen name>

| ID | Case | Steps | Expected |
|----|------|-------|----------|
| EXM-SC-001 | The list opens | Open the screen. | The list renders under its own title, with the button that opens the create form. |
| EXM-SC-002 | Required fields are marked | Open the create form. | Every field the server requires is visibly marked. A field the server requires and the form does not mark is a defect. |
| EXM-SC-003 | A duplicate code is refused | Create a record with a new code. Open the form again and use the same code. | The second save is refused and the reason appears next to the code. The first record is unaffected. |
| EXM-SC-004 SKIP | Bulk upload of 10,000 rows | Upload the sample file. | All rows appear within a minute. Not automated yet: needs a seeded volume fixture. |
