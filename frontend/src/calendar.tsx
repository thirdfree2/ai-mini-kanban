import { useState } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import type { TaskColor } from "./taskColors";
export type ScheduledTask = {
  id: string;
  title: string;
  status: string;
  startDate?: string;
  endDate?: string;
};
export function localDate(date: Date): string {
  return `${String(date.getFullYear()).padStart(4, "0")}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function parseLocal(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(0);
  date.setFullYear(y, m - 1, d);
  date.setHours(12, 0, 0, 0);
  return date;
}
export function dateLabel(value: string): string {
  return parseLocal(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
export function overlaps(
  task: ScheduledTask,
  from: string,
  to: string,
): boolean {
  return Boolean(
    task.startDate &&
      task.endDate &&
      (!from || task.endDate >= from) &&
      (!to || task.startDate <= to),
  );
}
export type TaskSegment = {
  task: ScheduledTask;
  start: string;
  end: string;
  lane: number;
};
/** Inclusive interval partitioning keeps every continuation in the same non-overlapping lane. */
export function calendarSegments(
  tasks: ScheduledTask[],
  from: string,
  to: string,
): TaskSegment[] {
  const laneEnds: string[] = [];
  return tasks
    .filter((t) => overlaps(t, from, to))
    .map((task) => ({
      task,
      start: [task.startDate!, from].filter(Boolean).sort().reverse()[0],
      end: [task.endDate!, to].filter(Boolean).sort()[0],
    }))
    .sort(
      (a, b) =>
        a.start.localeCompare(b.start) ||
        b.end.localeCompare(a.end) ||
        a.task.id.localeCompare(b.task.id),
    )
    .map((segment) => {
      let lane = laneEnds.findIndex((end) => end < segment.start);
      if (lane < 0) lane = laneEnds.length;
      laneEnds[lane] = segment.end;
      return { ...segment, lane };
    });
}
export function CalendarView({
  tasks,
  onEdit,
  onCreate,
  colors,
}: {
  tasks: ScheduledTask[];
  colors: Record<string, TaskColor>;
  onEdit: (id: string) => void;
  onCreate: (date: string) => void;
}) {
  const [month, setMonth] = useState(
    () => new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  );
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const invalid = Boolean(from && to && from > to);
  const scheduled = tasks.filter((t) => overlaps(t, from, to));
  const start = new Date(
    month.getFullYear(),
    month.getMonth(),
    1 - month.getDay(),
  );
  const days = Array.from(
    { length: 42 },
    (_, i) =>
      new Date(start.getFullYear(), start.getMonth(), start.getDate() + i),
  );
  const today = localDate(new Date());
  const segments = invalid ? [] : calendarSegments(scheduled, from, to);
  const weeks = Array.from({ length: 6 }, (_, i) =>
    days.slice(i * 7, i * 7 + 7),
  );
  return (
    <section className="calendar-view" aria-label="Task calendar">
      <div className="calendar-controls">
        <div className="month-controls">
          <button
            className="icon-button"
            aria-label="Previous month"
            onClick={() =>
              setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))
            }
          >
            <ChevronLeft size={18} />
          </button>
          <h2 aria-live="polite" data-testid="calendar-month">
            {month.toLocaleDateString(undefined, {
              month: "long",
              year: "numeric",
            })}
          </h2>
          <button
            className="icon-button"
            aria-label="Next month"
            onClick={() =>
              setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))
            }
          >
            <ChevronRight size={18} />
          </button>
          <button
            className="secondary"
            onClick={() =>
              setMonth(
                new Date(new Date().getFullYear(), new Date().getMonth(), 1),
              )
            }
          >
            Today
          </button>
        </div>
        <div className="calendar-filters">
          <label>
            From
            <input
              type="date"
              aria-label="Filter from date"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                if (e.target.value) {
                  const date = parseLocal(e.target.value);
                  date.setDate(1);
                  setMonth(date);
                }
              }}
            />
          </label>
          <label>
            To
            <input
              type="date"
              aria-label="Filter to date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
          {(from || to) && (
            <button
              className="secondary"
              onClick={() => {
                setFrom("");
                setTo("");
              }}
            >
              Clear filters
            </button>
          )}
        </div>
      </div>
      {invalid && (
        <p role="alert" className="error">
          The filter end date must be on or after the start date.
        </p>
      )}
      <p className="calendar-hint">
        Click a day to schedule a task. Date filters include tasks that overlap
        the selected range.
      </p>
      <p className="calendar-result" role="status">
        {invalid
          ? "Choose a valid date range to show scheduled tasks."
          : scheduled.length === 0
            ? "No scheduled tasks overlap this date range."
            : `${scheduled.length} scheduled ${scheduled.length === 1 ? "task" : "tasks"} match${scheduled.length === 1 ? "es" : ""} this date range.${
                scheduled.length > 0 &&
                !scheduled.some((t) => {
                  const rangeStart = [t.startDate!, from, localDate(days[0])]
                    .filter(Boolean)
                    .sort()
                    .reverse()[0];
                  const rangeEnd = [t.endDate!, to, localDate(days[41])]
                    .filter(Boolean)
                    .sort()[0];
                  return rangeStart <= rangeEnd;
                })
                  ? " Matching tasks are outside the displayed month; use month navigation to see them."
                  : ""
              }`}
      </p>
      <div className="calendar-scroll">
        <div className="calendar-grid" aria-label="Month dates">
          <div className="calendar-weekdays">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>
          <div className="calendar-weeks">
            {weeks.map((week) => {
              const weekStart = localDate(week[0]),
                weekEnd = localDate(week[6]);
              const bars = segments.filter(
                (s) => s.start <= weekEnd && s.end >= weekStart,
              );
              const laneCount = bars.reduce(
                (max, s) => Math.max(max, s.lane + 1),
                0,
              );
              return (
                <div
                  className="calendar-week"
                  key={weekStart}
                  data-testid={`calendar-week-${weekStart}`}
                  style={{
                    gridTemplateRows: `32px ${laneCount ? `repeat(${laneCount}, 29px)` : ""} minmax(18px,1fr)`,
                  }}
                >
                  {week.map((date, index) => {
                    const key = localDate(date);
                    return (
                      <div
                        key={key}
                        data-testid={`calendar-day-${key}`}
                        style={{ gridColumn: index + 1, gridRow: "1 / -1" }}
                        className={`calendar-day ${date.getMonth() !== month.getMonth() ? "outside-month" : ""} ${key === today ? "today" : ""} ${(from && key < from) || (to && key > to) ? "outside-filter" : ""}`}
                      >
                        <button
                          className="calendar-date"
                          aria-label={`Create task on ${key}`}
                          onClick={() => onCreate(key)}
                        >
                          <span>{date.getDate()}</span>
                          <Plus size={12} />
                        </button>
                      </div>
                    );
                  })}
                  {bars.map((segment) => {
                    const start =
                        segment.start < weekStart ? weekStart : segment.start,
                      end = segment.end > weekEnd ? weekEnd : segment.end;
                    const startColumn =
                        week.findIndex((d) => localDate(d) === start) + 1,
                      endColumn =
                        week.findIndex((d) => localDate(d) === end) + 2;
                    const color = colors[segment.task.id];
                    const continuesBefore = segment.start < weekStart,
                      continuesAfter = segment.end > weekEnd;
                    return (
                      <button
                        key={segment.task.id}
                        data-testid={`calendar-event-${segment.task.id}`}
                        data-start={start}
                        data-end={end}
                        data-lane={segment.lane}
                        data-color={color.key}
                        className={`calendar-range ${continuesBefore ? "continues-before" : ""} ${continuesAfter ? "continues-after" : ""}`}
                        style={{
                          gridColumn: `${startColumn} / ${endColumn}`,
                          gridRow: segment.lane + 2,
                          background: color.background,
                          color: color.text,
                          borderColor: color.border,
                        }}
                        aria-label={`Edit ${segment.task.title} from ${start} to ${end}`}
                        onClick={() => onEdit(segment.task.id)}
                        title={`${segment.task.title}: ${dateLabel(segment.task.startDate!)} – ${dateLabel(segment.task.endDate!)} · ${segment.task.status.replace("_", " ")}`}
                      >
                        <span aria-hidden="true">
                          {continuesBefore ? "‹ " : ""}
                          {segment.task.status === "done" ? "✓ " : ""}
                        </span>
                        <span className="range-title">
                          {segment.task.title}
                        </span>
                        <span aria-hidden="true">
                          {continuesAfter ? " ›" : ""}
                        </span>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <section className="unscheduled" aria-label="Unscheduled tasks">
        <h3>
          Unscheduled{" "}
          <span>{tasks.filter((t) => !t.startDate && !t.endDate).length}</span>
        </h3>
        <p>
          Tasks without dates stay here until you’re ready to schedule them.
        </p>
        <div>
          {tasks
            .filter((t) => !t.startDate && !t.endDate)
            .map((t) => (
              <button
                key={t.id}
                className="unscheduled-task"
                data-color={colors[t.id].key}
                style={{
                  background: colors[t.id].background,
                  borderColor: colors[t.id].border,
                  color: colors[t.id].text,
                }}
                onClick={() => onEdit(t.id)}
              >
                {t.title}
              </button>
            ))}
        </div>
      </section>
    </section>
  );
}
