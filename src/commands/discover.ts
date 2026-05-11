import * as vscode from 'vscode';
import * as cp from 'child_process';
import { TasksDataProvider } from '../views/tasksDataProvider';
import { isInPath } from '../services/llmCli';
import { newSpec } from './newSpec';

export async function discover(provider: TasksDataProvider): Promise<void> {
    const bin = (await isInPath('subq')) ? 'subq' : (await isInPath('miami')) ? 'miami' : null;
    if (!bin) {
        vscode.window.showErrorMessage(
            'SubQ / Miami not found in PATH — install via npm i -g @subq/cli or similar.'
        );
        return;
    }

    const query = await vscode.window.showInputBox({
        prompt: 'Discovery query',
        placeHolder: 'e.g. How is authentication handled in this repo?',
        ignoreFocusOut: true,
    });
    if (!query) return;

    const channel = vscode.window.createOutputChannel('Kosmo: Discovery');
    channel.show(true);
    channel.appendLine(`▶ ${bin} "${query}"`);
    channel.appendLine('');

    const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const proc = cp.spawn(bin, [query], { cwd, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });

    let output = '';
    proc.stdout.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        output += text;
        channel.append(text);
    });
    proc.stderr.on('data', (chunk: Buffer) => {
        const text = chunk.toString().trim();
        if (text) channel.appendLine(`  ! ${text}`);
    });

    proc.on('error', (err) => {
        const msg = (err as NodeJS.ErrnoException).code === 'ENOENT'
            ? `${bin} not found in PATH.`
            : err.message;
        channel.appendLine(`✗ ${msg}`);
        vscode.window.showErrorMessage(`Kosmo: ${msg}`);
    });

    proc.on('close', async (code) => {
        channel.appendLine('');
        if (code !== 0) {
            channel.appendLine(`✗ ${bin} exited ${code}`);
            vscode.window.showErrorMessage(`Kosmo: discovery failed (exit ${code}) — see Output`);
            return;
        }
        channel.appendLine('✓ discovery complete');

        const pick = await vscode.window.showQuickPick(
            [
                { label: '$(clippy) Copy output to clipboard', action: 'copy' },
                { label: '$(add) New Spec with this context', action: 'spec' },
            ],
            { placeHolder: 'What would you like to do with the discovery output?' }
        );

        if (!pick) return;
        if (pick.action === 'copy') {
            await vscode.env.clipboard.writeText(output.trim());
            vscode.window.showInformationMessage('Kosmo: discovery output copied to clipboard.');
        } else {
            await newSpec(provider, output.trim());
        }
    });
}
