import { getTranslations, getLocale } from "next-intl/server";
import { Heading, Text, Link, Pagination, EmptyState, ErrorState } from "@ame-de-fil/ui";
import { requireSession } from "../../../lib/dal";
import { getServerApiClient } from "../../../lib/server-api";
import { TaskViewTabs } from "../../../components/task-view-tabs";
import { TasksList } from "../../../components/tasks-list";
import { CreateTaskDialog } from "../../../components/create-task-dialog";
import type { AdminLocale } from "../../../i18n/config";

const PAGE_SIZE = 20;

interface TasksPageProps {
  searchParams: Promise<{ page?: string; view?: string; status?: string }>;
}

// Real GET /admin/tasks data (tasks.view-gated server-side), same
// real-data/pagination/permission/state conventions as orders/page.tsx.
// "view" (all/me/unassigned) maps to the API's own assignee filter; TaskRowActions
// and CreateTaskDialog both need the same staff list, so it's fetched once
// here and passed down rather than each component fetching it separately.
export default async function TasksPage({ searchParams }: TasksPageProps) {
  await requireSession();
  const { page: pageParam, view: viewParam, status: statusParam } = await searchParams;
  const page = Math.max(1, Number(pageParam ?? "1") || 1);
  const view = viewParam === "me" || viewParam === "unassigned" ? viewParam : "all";
  const status = statusParam === "ALL" ? "ALL" : "OPEN";

  const t = await getTranslations("Tasks");
  const tNav = await getTranslations("Navigation");
  const locale = (await getLocale()) as AdminLocale;
  const client = await getServerApiClient();

  const assignee = view === "all" ? undefined : view;
  const now = new Date().toISOString();

  const [tasksResult, assigneesResult] = await Promise.all([
    client.GET("/api/v1/admin/tasks", {
      params: { query: { page, pageSize: PAGE_SIZE, status, assignee } },
    }),
    client.GET("/api/v1/admin/tasks/assignees"),
  ]);

  const { data, error, response } = tasksResult;

  if (error) {
    return (
      <div>
        <Heading level={1}>{tNav("tasks")}</Heading>
        {response.status === 403 ? (
          <ErrorState className="mt-6" title={t("forbiddenTitle")} description={t("forbiddenDescription")} />
        ) : (
          <ErrorState className="mt-6" title={t("errorTitle")} description={t("errorDescription")} />
        )}
      </div>
    );
  }

  const assignees = assigneesResult.data ?? [];
  const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize));

  function buildTasksHref(page?: number): string {
    const params = new URLSearchParams();
    if (view !== "all") params.set("view", view);
    if (status === "ALL") params.set("status", "ALL");
    if (page && page > 1) params.set("page", String(page));
    const qs = params.toString();
    return qs ? `/tasks?${qs}` : "/tasks";
  }

  const toggleStatusHref = (() => {
    const params = new URLSearchParams();
    if (view !== "all") params.set("view", view);
    if (status === "OPEN") params.set("status", "ALL");
    const qs = params.toString();
    return qs ? `/tasks?${qs}` : "/tasks";
  })();

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <Heading level={1}>{tNav("tasks")}</Heading>
        <CreateTaskDialog assignees={assignees} />
      </div>

      <div className="mt-4">
        <TaskViewTabs current={view} />
      </div>

      <div className="mt-4 flex items-center justify-between gap-4">
        <Text tone="muted">{t("resultsCount", { count: data.total })}</Text>
        <Link href={toggleStatusHref} className="text-sm underline underline-offset-4">
          {status === "OPEN" ? t("showCompleted") : t("showOpenOnly")}
        </Link>
      </div>

      {data.items.length === 0 ? (
        <EmptyState className="mt-6" title={t("emptyTitle")} description={t("emptyDescription")} />
      ) : (
        <>
          <div className="mt-6">
            <TasksList tasks={data.items} assignees={assignees} locale={locale} now={now} />
          </div>
          {totalPages > 1 ? (
            <Pagination
              className="mt-8"
              page={data.page}
              totalPages={totalPages}
              makeHref={(targetPage) => buildTasksHref(targetPage)}
              previousLabel={t("paginationPrevious")}
              nextLabel={t("paginationNext")}
              pageLabel={(current, total) => t("paginationPage", { page: current, totalPages: total })}
            />
          ) : null}
        </>
      )}
    </div>
  );
}
