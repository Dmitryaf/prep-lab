export function isPublicLabResource(value: string) {
  return [
    "/labs/request-lifecycle.zip",
    "/labs/react-behavior.zip",
    "/labs/performance-lab.html",
  ].includes(value);
}
