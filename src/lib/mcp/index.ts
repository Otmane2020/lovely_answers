import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listProjectsTool from "./tools/list-projects";
import listAnswersTool from "./tools/list-answers";
import listArticlesTool from "./tools/list-articles";

const projectRef =
  import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "autopilotgeo-mcp",
  title: "AutopilotGEO",
  version: "0.1.0",
  instructions:
    "Read-only access to AutopilotGEO projects, AEO answers, and articles for the signed-in user. Use `list_projects` first to discover project IDs, then `list_answers` or `list_articles` scoped to a project.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listProjectsTool, listAnswersTool, listArticlesTool],
});
