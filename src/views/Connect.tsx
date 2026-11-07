import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Copy, Check } from "lucide-react";
import { PublicFooter } from "@/components/layout/PublicFooter";

export default function Connect() {
  const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID as string;
  const mcpUrl = `https://${projectRef}.supabase.co/functions/v1/mcp`;
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(mcpUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="min-h-screen bg-[hsl(222,47%,11%)] text-white">
      <main className="container max-w-3xl py-16 px-4">
        <h1 className="text-4xl font-bold mb-3">Connect AutopilotGEO to your AI assistant</h1>
        <p className="text-white/70 mb-10">
          Use ChatGPT or Claude to explore your projects, AEO answers, and articles. Paste
          the URL below into your assistant's connector settings.
        </p>

        <section className="mb-12">
          <h2 className="text-lg font-semibold mb-3 text-white/80">Your MCP server URL</h2>
          <div className="flex items-center gap-2 p-4 rounded-xl bg-white/5 border border-white/10">
            <code className="flex-1 text-sm break-all font-mono text-white/90">{mcpUrl}</code>
            <Button size="sm" variant="secondary" onClick={copy} className="shrink-0">
              {copied ? <><Check className="h-4 w-4 mr-1" /> Copied</> : <><Copy className="h-4 w-4 mr-1" /> Copy</>}
            </Button>
          </div>
          <p className="text-sm text-white/60 mt-2">
            You'll sign in with your AutopilotGEO account when connecting. The assistant will
            act as you and only see data you already have access to.
          </p>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-semibold mb-6">Connect</h2>

          <div className="mb-8">
            <h3 className="text-lg font-semibold mb-3">ChatGPT</h3>
            <ol className="list-decimal ml-5 space-y-2 text-white/80">
              <li>
                Open{" "}
                <a
                  href="https://chatgpt.com/#settings/Connectors/Advanced"
                  target="_blank"
                  rel="noreferrer"
                  className="underline text-white"
                >
                  ChatGPT Connectors → Advanced
                </a>{" "}
                and enable Developer mode (heed the risk notice shown there).
              </li>
              <li>In the chat composer's "+" menu, turn on Developer mode.</li>
              <li>Click <strong>Add sources</strong>, then <strong>Connect more</strong>.</li>
              <li>Name the connector "AutopilotGEO" and paste the MCP URL above.</li>
              <li>Ask ChatGPT to use AutopilotGEO.</li>
            </ol>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-3">Claude</h3>
            <ol className="list-decimal ml-5 space-y-2 text-white/80">
              <li>
                Open{" "}
                <a
                  href="https://claude.ai/customize/connectors?modal=add-custom-connector"
                  target="_blank"
                  rel="noreferrer"
                  className="underline text-white"
                >
                  Claude custom connectors
                </a>
                .
              </li>
              <li>Name the connector "AutopilotGEO" and paste the MCP URL above.</li>
              <li>Enable the connector from the chat composer, then ask Claude to use AutopilotGEO.</li>
            </ol>
          </div>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-semibold mb-6">Refresh after the app changes</h2>
          <p className="text-white/70 mb-6">
            Your assistant caches the connection. After we ship new features, refresh it to
            pick up the latest tools.
          </p>

          <div className="mb-8">
            <h3 className="text-lg font-semibold mb-3">ChatGPT</h3>
            <ol className="list-decimal ml-5 space-y-2 text-white/80">
              <li>Open ChatGPT's app preferences and pick AutopilotGEO under <strong>Enabled apps</strong>.</li>
              <li>Next to <strong>Information</strong>, click <strong>Refresh</strong>.</li>
              <li>If the URL changed, paste the latest URL from above.</li>
              <li>Start a new chat and ask ChatGPT to use AutopilotGEO.</li>
            </ol>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-3">Claude</h3>
            <ol className="list-decimal ml-5 space-y-2 text-white/80">
              <li>Open the Connectors page and select AutopilotGEO.</li>
              <li>Refresh or update the connector's tools.</li>
              <li>If the URL changed, paste the latest URL from above.</li>
              <li>Ask Claude to use AutopilotGEO.</li>
            </ol>
          </div>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
