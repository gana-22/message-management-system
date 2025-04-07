import { Test, TestingModule } from '@nestjs/testing';
import { RolesGuard } from './roles.guard';
import { Reflector } from '@nestjs/core';
import { ExecutionContext } from '@nestjs/common';

describe('Roles Guard', () => {
  let rolesGuard: RolesGuard;
  let reflector: Reflector;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RolesGuard,
        {
          provide: Reflector,
          useValue: {
            get: jest.fn(),
          },
        },
      ],
    }).compile();

    rolesGuard = module.get<RolesGuard>(RolesGuard);
    reflector = module.get<Reflector>(Reflector);
  });

  it('should return true if no roles are defined', () => {
    jest.spyOn(reflector, 'get').mockReturnValue(undefined);

    const context = {
      getHandler: jest.fn(),
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue({
          headers: {},
        }),
      }),
    } as unknown as ExecutionContext;

    expect(rolesGuard.canActivate(context)).toBe(true);
  });

  it('should return true if user role matches required roles', () => {
    jest.spyOn(reflector, 'get').mockReturnValue(['admin']);

    const context = {
      getHandler: jest.fn(),
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue({
          headers: { 'user-role': 'admin' },
        }),
      }),
    } as unknown as ExecutionContext;

    expect(rolesGuard.canActivate(context)).toBe(true);
  });

  it('should return true if user role matches any one of the required roles', () => {
    jest.spyOn(reflector, 'get').mockReturnValue(['admin', 'user']);

    const context = {
      getHandler: jest.fn(),
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue({
          headers: { 'user-role': 'user' },
        }),
      }),
    } as unknown as ExecutionContext;

    expect(rolesGuard.canActivate(context)).toBe(true);
  });

  it('should return false if user role does not match required roles', () => {
    jest.spyOn(reflector, 'get').mockReturnValue(['admin']);

    const context = {
      getHandler: jest.fn(),
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue({
          headers: { 'user-role': 'user' },
        }),
      }),
    } as unknown as ExecutionContext;

    expect(rolesGuard.canActivate(context)).toBe(false);
  });
});
