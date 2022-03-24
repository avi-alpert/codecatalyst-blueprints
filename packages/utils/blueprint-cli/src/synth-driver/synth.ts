import * as cp from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as pino from 'pino';
import * as yargs from 'yargs';
import { createCache } from './cache';
import { writeSynthDriver } from './driver';

export interface SynthesizeOptions extends yargs.Arguments {
  blueprint: string;
  outdir: string;
  cache: boolean;
  options?: string;
}

export async function synth(log: pino.BaseLogger, blueprint: string, outdir: string, useCache: boolean, options?: string): Promise<void> {
  if (!fs.existsSync(blueprint)) {
    log.error('blueprint directory does not exist: %s', blueprint);
    process.exit(255);
  }

  let synthDirectory = path.resolve(path.join(outdir, 'synth', String(Math.floor(Date.now() / 100))));
  cp.execSync(`mkdir -p ${synthDirectory}`, {
    stdio: 'inherit',
    cwd: outdir,
  });

  let loadedOptions = {};
  if (options) {
    if (!fs.existsSync(options)) {
      log.error('options file did not exist: %s', options);
      process.exit(255);
    }
    loadedOptions = {
      ...JSON.parse(fs.readFileSync(options, 'utf-8')),
    };
  }

  if (useCache) {
    const buildDirectory = path.join(blueprint, 'lib');
    const builtEntryPoint = './index.js';

    log.debug('Creating cache from built: %s', buildDirectory);
    log.debug('Creating cache from built blueprint: %s', builtEntryPoint);
    if (!fs.existsSync(buildDirectory) && !fs.existsSync(path.join(buildDirectory, builtEntryPoint))) {
      log.debug('Did you forget to build?');
      log.error('Blueprint entrypoint not found: %s', builtEntryPoint);
      process.exit(255);
    }

    const synthExecutionFile = createCache(
      {
        buildDirectory,
        builtEntryPoint,
      },
      log,
    );

    const command = `npx node ${synthExecutionFile} '${JSON.stringify(loadedOptions)}' '${synthDirectory}'`;
    log.debug('generated command: %s', command);
    cp.execSync(command, {
      stdio: 'inherit',
      cwd: blueprint,
    });
  } else {
    const driverFile = path.join(blueprint, 'synth-driver.ts');
    console.log(driverFile);
    try {
      writeSynthDriver(driverFile, path.join(blueprint, 'src', 'index.ts'));
      const command = `npx ts-node ${driverFile} '${JSON.stringify(loadedOptions)}' '${synthDirectory}'`;

      log.debug('generated command: %s', command);
      cp.execSync(command, {
        stdio: 'inherit',
        cwd: blueprint,
      });
    } catch (e) {
      throw e;
    } finally {
      log.debug('cleaning up synth driver: %s', driverFile);
      cp.execSync(`rm ${driverFile}`, {
        stdio: 'inherit',
        cwd: blueprint,
      });
    }
  }
}
