/**
 * Copyright 2024 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import * as clc from 'colorette';
import * as fs from 'fs';
import * as path from 'path';
import * as process from 'process';
import { z } from 'zod';
import { TraceDataSchema } from '../types/trace';
import { ToolPluginSchema } from './plugins';

const CONFIG_NAME = 'genkit-tools.conf.js';
const EVAL_FIELDS = ['input', 'output', 'context'] as const;

const InputSelectorSchema = z.object({
  inputOf: z.string(),
});
const OutputSelectorSchema = z.object({
  outputOf: z.string(),
});
const StepSelectorSchema = z.union([InputSelectorSchema, OutputSelectorSchema]);

const EvaluationExtractorSchema = z.record(
  z.enum(EVAL_FIELDS),
  z.union([
    z.string(), // specify the displayName (default to output)
    StepSelectorSchema, //, {inputOf: 'my-step-name'}
    z.function().args(TraceDataSchema).returns(z.string()), // custom trace extractor
  ])
);

const EvaluatorConfig = z.object({
  flowName: z
    .string()
    .describe('specify which flow this config is for')
    .optional(),
  extractors: z.optional(EvaluationExtractorSchema),
});

const ToolsConfigSchema = z
  .object({
    cliPlugins: z.optional(z.array(ToolPluginSchema)),
    builder: z
      .object({
        cmd: z.string().optional(),
      })
      .optional(),
    evaluators: z.array(EvaluatorConfig).optional(),
  })
  .strict();

export type ToolsConfig = z.infer<typeof ToolsConfigSchema>;

let cachedConfig: Promise<ToolsConfig | null> | null = null;

/**
 * Searches recursively up the directory structure for the Genkit tools config
 * file.
 */
export async function findToolsConfig(): Promise<ToolsConfig | null> {
  if (!cachedConfig) {
    cachedConfig = findToolsConfigInternal();
  }
  return cachedConfig;
}

async function findToolsConfigInternal(): Promise<ToolsConfig | null> {
  let current = process.cwd();
  while (path.resolve(current, '..') !== current) {
    if (fs.existsSync(path.resolve(current, CONFIG_NAME))) {
      const configPath = path.resolve(current, CONFIG_NAME);
      const config = (await import(configPath)) as { default: unknown };
      const result = ToolsConfigSchema.safeParse(config.default);
      if (result.success) {
        return result.data;
      }

      console.warn(
        `${clc.bold(clc.yellow('Warning:'))} ` +
          `Malformed tools schema:\n${result.error.toString()}`
      );
      return null;
    }
    current = path.resolve(current, '..');
  }

  return null;
}

/**
 * Simply directly returns the tools configuration. We do validation of the
 * schema at runtime in `findToolsConfig()`. This function is exported for
 * aesthetic reasons...
 */
export function genkitToolsConfig(cfg: unknown): ToolsConfig {
  return cfg as ToolsConfig;
}