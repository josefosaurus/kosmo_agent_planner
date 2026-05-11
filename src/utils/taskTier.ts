import { ModelTier } from '../services/llmCli';

export function resolveTaskTier(title: string, details: string[]): ModelTier {
    const match = [title, ...details].join('\n').match(/\[model:(haiku|sonnet|opus)\]/i);
    if (!match) return 'sonnet';
    return match[1].toLowerCase() as ModelTier;
}
