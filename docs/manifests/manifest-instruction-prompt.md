***Instructions for Generating Implemenation Manifests***

To maximize token usage efficiency in Claude Code, we use Gemini Pro Mode to Develop surgical implmentation prompts for us that reduce context and optimize usage. Remember to use the @ symbol in fornt of filenames to point Claude directly to the file before executing the prompt.

*PROMPT:
"Here is the Technical Design Document for my new feature. I will be implementing this using a CLI coding assistant with a limited context window.

Please generate a separate 'Implementation Manifest' in markdown. Break the feature delivery down into sequential, isolated steps. For each step, provide:

A brief explanation of the goal.

The exact list of files the CLI needs to read (keep this strictly limited to only what is necessary). Mark the files and their path with the @ symbol to allow Claude to reference it directly.

The exact, surgical prompt I should copy and paste into my CLI to execute that step. Do not include architectural fluff in the prompt; focus only on the specific code changes required for those specific files."