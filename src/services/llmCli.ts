import * as cp from 'child_process';
import * as os from 'os';
import * as vscode from 'vscode';
import { loadDotEnv } from '../utils/fileSystem';

let _extensionPath: string | undefined;
export function setExtensionPath(p: string): void { _extensionPath = p; }

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
    opencode: {
        haiku:  ['-m', 'anthropic/claude-haiku-4-5-20251001'],
        sonnet: ['-m', 'anthropic/claude-sonnet-4-6'],
        opus:   ['-m', 'anthropic/claude-opus-4-7'],
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
export interface CliAdapter {
    bin: string;
    label: string;
    args: (prompt: string, mode: 'spec' | 'task') => string[];
    supportsStreaming: boolean;
    wrapPrompt?: (prompt: string) => string;
    trustGate?: TrustGate;
}

const KNOWN_CLIS: CliAdapter[] = [
    {
        bin: 'claude',
        label: 'Claude Code (claude)',
        supportsStreaming: true,
        args: (p, mode) => {
            const base = ['-p', p];
            if (mode === 'task') base.push('--output-format', 'stream-json', '--verbose');
            return base;
        },
    },
    {
        bin: 'gemini',
        label: 'Gemini CLI (gemini)',
        supportsStreaming: true,
        // --output-format text → clean text, no ANSI tables or JSON wrappers
        args: (p, mode) => {
            if (mode === 'task') return ['-p', p, '--output-format', 'stream-json', '--verbose'];
            return ['-p', p, '--output-format', 'text'];
        },
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
    {
        bin: 'codex',
        label: 'OpenAI Codex (codex)',
        supportsStreaming: false,
        args: p => [p],
    },
    {
        bin: 'opencode',
        label: 'OpenCode (opencode)',
        supportsStreaming: true,
        args: (p, mode) => {
            if (mode === 'task') return ['run', p, '--output-format', 'stream-json', '--verbose'];
            return ['run', p];
        },
        // opencode is an agent — instruct the model to return plain text, not use file tools
        wrapPrompt: p =>
            `${p}\n\nIMPORTANT: Output the complete document as plain text in your response. Do NOT use write_file, create_file, edit, str_replace, or any other file-system tools.`,
    },
    { bin: 'deepseek', label: 'DeepSeek CLI (deepseek)',  supportsStreaming: false, args: p => [p] },
    { bin: 'llm',      label: 'llm (Simon Willison)',      supportsStreaming: false, args: p => [p] },
    { bin: 'sgpt',     label: 'ShellGPT (sgpt)',           supportsStreaming: false, args: p => [p] },
    { bin: 'subq',     label: 'SubQ / Miami (subq)',       supportsStreaming: false, args: p => [p] },
    { bin: 'miami',    label: 'Miami (miami)',              supportsStreaming: false, args: p => [p] },
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

export async function getSelectedCli(): Promise<CliAdapter> {
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

/**
 * Resolves ANTHROPIC_API_KEY in priority order:
 * 1. workspace .env (passed as dotEnv)
 * 2. extension directory .env
 * 3. process.env (usually empty in VSCode extension host)
 * 4. login shell env (reads ~/.zprofile, ~/.zshrc etc. via `zsh -l -c`)
 * 5. VSCode input prompt (session-cached, never written to disk)
 */
let _cachedApiKey: string | undefined;
export async function resolveAnthropicKey(dotEnv: Record<string, string> = {}): Promise<string | undefined> {
    // 1. workspace .env
    if (dotEnv['ANTHROPIC_API_KEY']) return dotEnv['ANTHROPIC_API_KEY'];

    // 2. extension dir .env
    if (_extensionPath) {
        const extEnv = await loadDotEnv(_extensionPath);
        if (extEnv['ANTHROPIC_API_KEY']) return extEnv['ANTHROPIC_API_KEY'];
    }

    // 3. process.env
    if (process.env['ANTHROPIC_API_KEY']) return process.env['ANTHROPIC_API_KEY'];

    // 4. cached from prompt
    if (_cachedApiKey) return _cachedApiKey;

    // 5. login shell — handles vars set in ~/.zprofile, ~/.zshrc, ~/.bash_profile
    const shellKey = await readKeyFromLoginShell();
    if (shellKey) return shellKey;

    // 6. VSCode prompt
    const input = await vscode.window.showInputBox({
        title: 'Anthropic API Key required',
        prompt: 'Not found in .env or shell env. Enter ANTHROPIC_API_KEY (session only, not saved to disk)',
        password: true,
        ignoreFocusOut: true,
        validateInput: v => v.trim() ? undefined : 'API key cannot be empty',
    });
    if (input?.trim()) {
        _cachedApiKey = input.trim();
        return _cachedApiKey;
    }
    return undefined;
}

function readKeyFromLoginShell(): Promise<string | undefined> {
    return new Promise(resolve => {
        const shell = process.env['SHELL'] ?? '/bin/zsh';
        const home = os.homedir();
        // -l = login shell (sources profile files), -c = run command
        const proc = cp.spawn(shell, ['-l', '-c', 'echo $ANTHROPIC_API_KEY'], {
            env: { HOME: home, PATH: process.env['PATH'] ?? '/usr/local/bin:/usr/bin:/bin' },
            stdio: ['ignore', 'pipe', 'ignore'],
        });
        let out = '';
        proc.stdout.on('data', (chunk: Buffer) => { out += chunk.toString(); });
        proc.on('close', () => {
            const val = out.trim();
            resolve(val && val !== '' ? val : undefined);
        });
        proc.on('error', () => resolve(undefined));
        // Don't hang if shell is slow
        setTimeout(() => { proc.kill(); resolve(undefined); }, 5000);
    });
}

function spawnCli(cli: CliAdapter, args: string[], cwd: string, env?: NodeJS.ProcessEnv): Promise<string & { exitCode?: number }> {
    return new Promise((resolve, reject) => {
        out().appendLine(`[kosmo] $ ${cli.bin} ${args.map(a => a.length > 80 ? a.slice(0, 80) + '…' : a).join(' ')}`);
        out().appendLine(`[kosmo] cwd: ${cwd}`);
        const proc = cp.spawn(cli.bin, args, { cwd, env: env ?? process.env, stdio: ['ignore', 'pipe', 'pipe'] });
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
    const baseArgs = [...cli.args(finalPrompt, 'spec'), ...modelArgs];

    const dotEnv = await loadDotEnv(cwd);
    const apiKey = await resolveAnthropicKey(dotEnv);
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set — cannot run CLI.');
    const spawnEnv: NodeJS.ProcessEnv = { ...process.env, ...dotEnv, ANTHROPIC_API_KEY: apiKey };

    try {
        return await spawnCli(cli, baseArgs, cwd, spawnEnv);
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
            return spawnCli(cli, [...baseArgs, ...gate.extraArgs], cwd, spawnEnv);
        }

        throw err;
    }
}
