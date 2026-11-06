import { reactive } from "vue";
// Ephemeral navigation state: returning from theory keeps the selected practice item.
// Durable ratings and interview snapshots are owned by the progress store.
export const practiceState = reactive({
  level: "standard",
  filter: "route",
  kind: "all",
  index: 0,
});
