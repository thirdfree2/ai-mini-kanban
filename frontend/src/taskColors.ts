export type TaskColor = {
  background: string;
  border: string;
  text: string;
  key: string;
};
/** Resolve palette collisions across the whole board, independent of view and filters. */
export function taskColors(tasks: { id: string }[]): Record<string, TaskColor> {
  const result: Record<string, TaskColor> = {};
  const used = new Set<number>();
  for (const task of [...tasks].sort((a, b) => a.id.localeCompare(b.id))) {
    let hash = 2166136261;
    for (const char of task.id)
      hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
    let slot = (hash >>> 0) % 12;
    while (used.has(slot)) slot++;
    used.add(slot);
    const hue = (slot * 137.508) % 360;
    result[task.id] = {
      background: `hsl(${hue.toFixed(3)} 66% 88%)`,
      border: `hsl(${hue.toFixed(3)} 43% 49%)`,
      text: `hsl(${hue.toFixed(3)} 48% 24%)`,
      key: `task-color-${slot}`,
    };
  }
  return result;
}
