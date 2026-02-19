import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  route("/", "routes/Layout.tsx", [
    index("routes/Dashboard.tsx"),
    route("applicants", "routes/Applicants.tsx"),
    route("applicants/:id", "routes/CandidateDetail.tsx"),
    route("jobs", "routes/Jobs.tsx"),
    route("messages", "routes/Messages.tsx"),
    route("settings", "routes/Settings.tsx"),
    route("*", "routes/NotFound.tsx"),
  ]),
] satisfies RouteConfig;
