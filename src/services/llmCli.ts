import * as cp from 'child_process';
import * as vscode from 'vscode';

const CONFIG_KEY = 'kosmo.specCli';

interface CliAdapter {
    bin: string;
    label: string;
    args: (prompt: string) => string[];
}

const KNOWN_CLIS: CliAdapter[] = [
    { bin: 'claude',   label: 'Claude Code (claude)',     args: p => ['-p', p] },
    { bin: 'gemini',   label: 'Gemini CLI (gemini)',      args: p => ['-p', p] },
    { bin: 'codex',    label: 'OpenAI Codex (codex)',     args: p => [p] },
    { bin: 'opencode', label: 'OpenCode (opencode)',      args: p => [p] },
    { bin: 'deepseek', label: 'DeepSeek CLI (deepseek)', args: p => [p] },
    { bin: 'llm',      label: 'llm (Simon Willison)',     args: p => [p] },
    { bin: 'sgpt',     label: 'ShellGPT (sgpt)',          args: p => [p] },
];

function isInPath(bin: string): Promise<boolean> {
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

export function runWithCli(prompt: string, cwd: string): Promise<string> {
    return getSelectedCli().then(cli => new Promise((resolve, reject) => {
        const proc = cp.spawn(cli.bin, cli.args(prompt), {
            cwd, env: process.env, stdio: ['ignore', 'pipe', 'pipe']
        });
        let stdout = '';
        let stderr = '';
        proc.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
        proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
        proc.on('error', err => {
            reject((err as NodeJS.ErrnoException).code === 'ENOENT'
                ? new Error(`${cli.bin} CLI not found in PATH.`)
                : err);
        });
        proc.on('close', code => {
            code === 0
                ? resolve(stdout.trim())
                : reject(new Error(`${cli.bin} exited ${code}: ${stderr.trim()}`));
        });
    }));
}
