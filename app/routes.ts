import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  route("auth", "routes/Auth.tsx"),
  route("auth/callback", "routes/AuthCallback.tsx"),
  route("terms", "routes/Terms.tsx"),
  route("privacy", "routes/Privacy.tsx"),
  route("/", "routes/Layout.tsx", [
    index("routes/Dashboard.tsx"),
    route("applicants", "routes/Applicants.tsx"),
    route("applicants/:id", "routes/CandidateDetail.tsx"),
    route("jobs", "routes/Jobs.tsx"),
    route("jobs/:id", "routes/JobDetail.tsx"),
    route("offers", "routes/Offers.tsx"),
    route("interviews", "routes/InterviewStudio.tsx"),
    route("pipeline", "routes/PipelineActivity.tsx"),
    route("ai-agent", "routes/AiAgentSettings.tsx"),
    route("settings", "routes/Settings.tsx"),
    route("*", "routes/NotFound.tsx"),
  ]),
] satisfies RouteConfig;
