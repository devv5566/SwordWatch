import { Request } from 'express';
import { envGet, envGetAppId, envGetAppName, envGetRequired, envIsProd, isElfHostedInstance } from './env';

describe('env', () => {
  test('envGet', () => {
    expect(envGet('NODE_ENV')).toBe('test');
  });

  test('envGetRequired set', () => {
    expect(envGetRequired('NODE_ENV')).toBe('test');
  });

  test('envGetRequired not set', () => {
    expect(() => envGetRequired('NOT_SET')).toThrow('Environment variable "NOT_SET" is not configured.');
  });

  test('envGetAppId', () => {
    expect(envGetAppId()).toBe('swordwatch');

    process.env['MANIFEST_ID'] = 'swordwatch.dev';
    expect(envGetAppId()).toBe('swordwatch.dev');
    delete process.env['MANIFEST_ID'];
  });

  test('envGetAppName', () => {
    expect(envGetAppName()).toBe('SwordWatch');

    process.env['MANIFEST_NAME'] = 'SwordWatch | dev';
    expect(envGetAppName()).toBe('SwordWatch | dev');
    delete process.env['MANIFEST_NAME'];
  });

  test('envIsProd', () => {
    expect(envIsProd()).toBeFalsy();

    const previousNodeEnv = process.env['NODE_ENV'];
    process.env['NODE_ENV'] = 'production';
    expect(envIsProd()).toBeTruthy();
    process.env['NODE_ENV'] = previousNodeEnv;
  });

  test('isElfHostedInstancce', () => {
    expect(isElfHostedInstance({ host: 'someuser.elfhosted.com' } as Request)).toBeTruthy();
    expect(isElfHostedInstance({ host: 'swordwatch.hayd.uk' } as Request)).toBeFalsy();
  });
});
