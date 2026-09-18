import { getTranslations } from "next-intl/server";
import { Card, Badge, Text, Link } from "@ame-de-fil/ui";
import { taskBucket, taskBucketTone, taskStatusTone, type TaskBucket } from "../lib/task-status";
import { TaskRowActions, type AssigneeOption } from "./task-row-actions";
import { formatDate as formatDueDate } from "../lib/format-date";
import type { AdminLocale } from "../i18n/config";

export interface TaskListItem {
  id: string;
  type: string;
  status: "OPEN" | "DONE" | "CANCELED";
  title: string;
  dueAt: string | null;
  assignedTo: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string;
  } | null;
  order: { id: string; orderNumber: string } | null;
  variant: { id: string; articleNumber: number; productName: string } | null;
}

interface TasksListProps {
  tasks: TaskListItem[];
  assignees: AssigneeOption[];
  locale: AdminLocale;
  now: string;
}

const BUCKET_ORDER: TaskBucket[] = ["overdue", "dueToday", "dueTomorrow", "upcoming", "noDueDate"];

// Grouped by urgency bucket rather than one flat table — a dense table row
// can't comfortably hold this row's actual interactive content (an
// assignee select plus a status action), so this reads as a card list
// throughout, not a desktop-table/mobile-card split like OrdersTable.
export async function TasksList({ tasks, assignees, locale, now }: TasksListProps) {
  const t = await getTranslations("Tasks");
  const nowDate = new Date(now);

  const buckets = new Map<TaskBucket, TaskListItem[]>();
  for (const task of tasks) {
    const bucket = taskBucket(task.dueAt, nowDate);
    const existing = buckets.get(bucket);
    if (existing) existing.push(task);
    else buckets.set(bucket, [task]);
  }

  return (
    <div className="flex flex-col gap-8">
      {BUCKET_ORDER.filter((bucket) => buckets.has(bucket)).map((bucket) => (
        <div key={bucket}>
          <div className="mb-3 flex items-center gap-2">
            <Badge tone={taskBucketTone(bucket)}>{t(`bucket.${bucket}`)}</Badge>
            <Text size="sm" tone="muted">
              {t("bucketCount", { count: buckets.get(bucket)!.length })}
            </Text>
          </div>
          <ul className="flex flex-col gap-3">
            {buckets.get(bucket)!.map((task) => (
              <li key={task.id}>
                <Card>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Text className="font-medium text-neutral-900">{task.title}</Text>
                        <Badge tone="neutral">{t(`type.${task.type}`)}</Badge>
                        {task.status !== "OPEN" ? (
                          <Badge tone={taskStatusTone(task.status)}>
                            {t(`status.${task.status}`)}
                          </Badge>
                        ) : null}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-neutral-600">
                        {task.dueAt ? (
                          <span>{t("dueOn", { date: formatDueDate(task.dueAt, locale) })}</span>
                        ) : null}
                        {task.order ? (
                          <Link
                            href={`/orders/${task.order.id}`}
                            className="underline underline-offset-4"
                          >
                            {t("orderLink", { orderNumber: task.order.orderNumber })}
                          </Link>
                        ) : null}
                        {task.variant ? (
                          <span>
                            {t("variantLabel", {
                              productName: task.variant.productName,
                              articleNumber: task.variant.articleNumber,
                            })}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <TaskRowActions
                      taskId={task.id}
                      status={task.status}
                      assignedToUserId={task.assignedTo?.id ?? null}
                      assignees={assignees}
                    />
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
