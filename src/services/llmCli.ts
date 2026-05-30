import * as cp from 'child_process';
import * as vscode from 'vscode';

const CONFIG_KEY = 'kosmo.specCli';

let _out: vscode.OutputChannel | undefined;
function out(): vscode.OutputChannel {
    if (!_out) _out = vscode.window.createOutputChannel('Kosmo Spec');
    return _out;
}

export type ModelTier = 'haiku' | 'sonnet' | 'opus';

const CLI_MODEL_FLAGS: Partial<Record<string, Record<ModelTier, string[]>>> = {
    claude: {
        haiku:  ['--model', 'claude-haiku-4-5-20251001'],
        sonnet: ['--model', 'claude-sonnet-4-6'],
        opus:   ['--model', 'claude-opus-4-7'],
    },
    // Gemini CLI uses Code Assist API — model names differ from public API.
    // No flag = CLI uses its own configured default, avoiding 404s.
    gemini: {
        haiku:  [],
        sonnet: [],
        opus:   [],
    },
    codex: {
        haiku:  ['--model', 'gpt-4o-mini'],
        sonnet: ['--model', 'gpt-4o'],
        opus:   ['--model', 'o3'],
    },
    deepseek: {
        haiku:  ['--model', 'deepseek-chat'],
        sonnet: ['--model', 'deepseek-chat'],
        opus:   ['--model', 'deepseek-reasoner'],
    },
};

export function resolveModelFlag(cliBin: string, tier: ModelTier): string[] {
    return CLI_MODEL_FLAGS[cliBin]?.[tier] ?? [];
}

/**
 * Some CLIs refuse to run headlessly without explicit trust.
 * When the CLI exits with `exitCode`, Kosmo shows a modal explaining
 * what `permissionLabel` means and asks the user to approve.
 * If approved, `extraArgs` are appended and the call is retried once.
 */
interface TrustGate {
    exitCode: number;
    permissionLabel: string;  // shown in the modal, describes what the user is allowing
    extraArgs: string[];      // args added only after user approves
}

/**
 * Some CLIs are agents that write files via tool calls instead of printing
 * to stdout. `wrapPrompt` adapts the prompt to request plain-text output.
 */
interface CliAdapter {
    bin: string;
    label: string;
    args: (prompt: string) => string[];
    wrapPrompt?: (prompt: string) => string;
    trustGate?: TrustGate;
}

const KNOWN_CLIS: CliAdapter[] = [
    {
        bin: 'claude',
        label: 'Claude Code (claude)',
        args: p => ['-p', p],
    },
    {
        bin: 'gemini',
        label: 'Gemini CLI (gemini)',
        // --output-format text → clean text, no ANSI tables or JSON wrappers
        args: p => ['-p', p, '--output-format', 'text'],
        // Gemini CLI is an agent that tries to write files via tools.
        // We instruct the model to output text directly instead.
        wrapPrompt: p =>
            `${p}\n\nIMPORTANT: Output the complete document as plain text in your response. Do NOT use write_file, create_file, str_replace, or any other file-system tools.`,
        // Gemini exits 55 when the workspace is not in its trusted list.
        // We ask the user, then pass --skip-trust (session-only, no persistent change).
        trustGate: {
            exitCode: 55,
            permissionLabel:
                'Gemini CLI requires workspace trust to run in headless mode.\n\n' +
                'Kosmo will pass --skip-trust for this session only. ' +
                'This does NOT grant Gemini permission to edit files — ' +
                'it only allows it to start without an interactive trust prompt.',
            extraArgs: ['--skip-trust'],
        },
    },
    { bin: 'codex',    label: 'OpenAI Codex (codex)',     args: p => [p] },
    { bin: 'opencode', label: 'OpenCode (opencode)',       args: p => [p] },
    { bin: 'deepseek', label: 'DeepSeek CLI (deepseek)',  args: p => [p] },
    { bin: 'llm',      label: 'llm (Simon Willison)',      args: p => [p] },
    { bin: 'sgpt',     label: 'ShellGPT (sgpt)',           args: p => [p] },
    { bin: 'subq',     label: 'SubQ / Miami (subq)',       args: p => [p] },
    { bin: 'miami',    label: 'Miami (miami)',              args: p => [p] },
];

export function isInPath(bin: string): Promise<boolean> {
    return new Promise(resolve => {
        const cmd = process.platform === 'win32' ? 'where' : 'which';
        const proc = cp.spawn(cmd, [bin], { stdio: 'ignore' });
        proc.on('close', code => resolve(code === 0));
        proc.on('error', () => resolve(false));
    });
}

async function detectClis(): Promise<CliAdapter[]> {
    const results = await Promise.all(
        KNOWN_CLIS.map(async cli => ({ cli, found: await isInPath(cli.bin) }))
    );
    return results.filter(r => r.found).map(r => r.cli);
}

export async function selectCli(): Promise<void> {
    const config = vscode.workspace.getConfiguration();
    const available = await detectClis();

    if (available.length === 0) {
        vscode.window.showErrorMessage(
            'No supported AI CLI found in PATH. Install Claude Code, Gemini CLI, or another supported agent.'
        );
        return;
    }

    const pick = await vscode.window.showQuickPick(
        available.map(c => ({ label: c.label, description: c.bin, cli: c })),
        { placeHolder: 'Select AI CLI for spec generation' }
    );

    if (!pick) return;
    await config.update(CONFIG_KEY, pick.cli.bin, vscode.ConfigurationTarget.Global);
    vscode.window.showInformationMessage(`Kosmo: using ${pick.label} for spec generation.`);
}

async function getSelectedCli(): Promise<CliAdapter> {
    const config = vscode.workspace.getConfiguration();
    const saved = config.get<string>(CONFIG_KEY);

    if (saved) {
        const adapter = KNOWN_CLIS.find(c => c.bin === saved);
        if (adapter) return adapter;
    }

    const available = await detectClis();

    if (available.length === 0) {
        throw new Error(
            'No supported AI CLI found in PATH. Install Claude Code, Gemini CLI, or another supported agent.'
        );
    }

    if (available.length === 1) {
        await config.update(CONFIG_KEY, available[0].bin, vscode.ConfigurationTarget.Global);
        return available[0];
    }

    const pick = await vscode.window.showQuickPick(
        available.map(c => ({ label: c.label, description: c.bin, cli: c })),
        { placeHolder: 'Select AI CLI for spec generation' }
    );

    if (!pick) throw new Error('No CLI selected.');
    await config.update(CONFIG_KEY, pick.cli.bin, vscode.ConfigurationTarget.Global);
    return pick.cli;
}

// eslint-disable-next-line no-control-regex
const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '');

// CLIs that the user has granted trust for this session
const sessionTrusted = new Set<string>();

function spawnCli(cli: CliAdapter, args: string[], cwd: string): Promise<string & { exitCode?: number }> {
    return new Promise((resolve, reject) => {
        out().appendLine(`[kosmo] $ ${cli.bin} ${args.map(a => a.length > 80 ? a.slice(0, 80) + '…' : a).join(' ')}`);
        out().appendLine(`[kosmo] cwd: ${cwd}`);
        const proc = cp.spawn(cli.bin, args, { cwd, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
        let stdout = '';
        let stderr = '';
        proc.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
        proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
        proc.on('error', err => {
            const msg = (err as NodeJS.ErrnoException).code === 'ENOENT'
                ? `${cli.bin} not found in PATH. Is it installed?`
                : (err as Error).message;
            out().appendLine(`[kosmo] error: ${msg}`);
            out().show(true);
            reject(new Error(msg));
        });
        proc.on('close', code => {
            out().appendLine(`[kosmo] exit: ${code}`);
            if (stderr.trim()) out().appendLine(`[kosmo] stderr:\n${stripAnsi(stderr.trim())}`);
            if (code === 0) {
                resolve(stdout.trim());
            } else {
                out().show(true);
                const e = new Error(`${cli.bin} exited ${code}: ${stripAnsi(stderr.trim()) || '(no output)'}`);
                (e as Error & { exitCode?: number }).exitCode = code ?? -1;
                reject(e);
            }
        });
    });
}

export async function runWithCli(prompt: string, cwd: string, tier?: ModelTier): Promise<string> {
    const cli = await getSelectedCli();
    const finalPrompt = cli.wrapPrompt ? cli.wrapPrompt(prompt) : prompt;
    const modelArgs = resolveModelFlag(cli.bin, tier ?? 'sonnet');
    const baseArgs = [...cli.args(finalPrompt), ...modelArgs];

    try {
        return await spawnCli(cli, baseArgs, cwd);
    } catch (err) {
        const gate = cli.trustGate;
        const code  = (err as Error & { exitCode?: number }).exitCode;

        if (gate && code === gate.exitCode) {
            if (!sessionTrusted.has(cli.bin)) {
                const answer = await vscode.window.showWarningMessage(
                    gate.permissionLabel,
                    { modal: true },
                    'Allow for this session',
                );
                if (answer !== 'Allow for this session') {
                    throw new Error(`${cli.bin}: permission denied by user.`);
                }
                sessionTrusted.add(cli.bin);
            }
            // Already trusted or just approved — retry with the permission args
            return spawnCli(cli, [...baseArgs, ...gate.extraArgs], cwd);
        }

        throw err;
    }
}
