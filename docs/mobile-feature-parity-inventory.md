# Mobile Feature Parity Inventory

This inventory records features that are reduced on phone-sized screens while remaining fuller-featured on larger screens. It accompanies the employee mobile action update so the known adjacent parity gaps are visible without expanding this repair into redesigning every responsive surface.

## Updated in this change

| Area | File | Larger-screen behavior | Phone behavior after update | Impact |
| --- | --- | --- | --- | --- |
| Employees tab employee row actions | `apps/web/src/features/employees/EmployeesPage.tsx` | Admins with the existing permission guards can edit employees, reset passwords, manage wages, and change active state from the row controls. | The same guarded management actions are available from phone-visible employee row controls. | Management-impacting; repaired for this task. |

## Other reduced phone experiences found

| Area | File | Larger-screen behavior | Phone-sized behavior | Impact |
| --- | --- | --- | --- | --- |
| Projects list row metadata | `apps/web/src/features/projects/ProjectsPage.tsx` | Rows show right-side metadata including contract value, status badge, and target date in addition to the project name, number, type, and location. | The right-side metadata container is hidden below the `sm` breakpoint, leaving project name, number, type, and location visible. | Informational; project navigation remains available. |
| Project documents tags | `apps/web/src/features/projects/tabs/DocumentsTab.tsx` | Document rows can show up to two tags beside client visibility, file date, size, version, and description. | Tags are hidden until the `lg` breakpoint, while core document identity, client visibility, metadata, and filtering remain visible. | Informational; document list and category filtering remain available. |
| Subcontractors list expiry and row actions | `apps/web/src/features/subcontractors/SubcontractorsPage.tsx` | Rows show insurance and license expiry summaries and management buttons for edit/delete when the user can manage subcontractors. | The expiry/action cluster is hidden below the `sm` breakpoint; contact summary and expanded detail remain visible, but edit/delete row buttons are not visible in the collapsed phone row. | Management-impacting; should be prioritized as follow-up if mobile subcontractor administration is required. |

## Not counted as management-impacting reductions

- Responsive layout changes that only stack filters, headers, or breadcrumbs were not counted when they preserved the same controls and information.
- Portal header/tab label truncation was not counted as an admin management feature reduction because the task focuses on admin app functionality.
