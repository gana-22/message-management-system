/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Logger } from '@nestjs/common';

const logger = new Logger('HelperService');

// retry mechanism
export async function retryMechanism(
  fn: () => Promise<void>,
  retries: number,
  delay: number,
) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await fn();
      return;
    } catch (error) {
      if (attempt < retries) {
        logger.log(`Retry ${attempt}/${retries} in ${delay}ms`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        throw new Error(
          `fn failed after ${retries} retries: ${error?.message || error}`,
        );
      }
    }
  }
}

// create keys from json data
export function createKey(...args: unknown[]): string {
  return args
    .map((arg) => {
      if (typeof arg === 'object' && arg !== null) {
        const sortedEntries = Object.entries(
          arg as Record<string, unknown>,
        ).sort(([a], [b]) => a.localeCompare(b));

        const sortedObj: Record<string, unknown> = {};
        for (const [key, value] of sortedEntries) {
          sortedObj[key] = value;
        }

        return JSON.stringify(sortedObj);
      }
      return String(arg);
    })
    .join(':');
}
