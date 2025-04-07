import { retryMechanism, createKey } from './service';

jest.mock(
  'global',
  () => ({
    ...global,
    setTimeout: (fn) => {
      fn();
      return null;
    },
  }),
  { virtual: true },
);

describe('Helper Service', () => {
  describe('retryMechanism', () => {
    let mockFn: jest.Mock;

    beforeEach(() => {
      mockFn = jest.fn();
    });

    afterEach(() => {
      jest.clearAllMocks();
    });

    it('should execute function successfully without retries if it succeeds', async () => {
      mockFn.mockResolvedValueOnce(undefined);

      await retryMechanism(mockFn, 3, 10);

      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it('should retry the function number of times', async () => {
      mockFn
        .mockRejectedValueOnce(new Error('fail 1'))
        .mockRejectedValueOnce(new Error('fail 2'))
        .mockResolvedValueOnce(undefined);

      await retryMechanism(mockFn, 3, 10);

      expect(mockFn).toHaveBeenCalledTimes(3);
    }, 10000);

    it('should throw an error if all retries fail', async () => {
      mockFn.mockRejectedValue(new Error('test error'));

      await expect(retryMechanism(mockFn, 3, 10)).rejects.toThrow(
        'fn failed after 3 retries: test error',
      );

      expect(mockFn).toHaveBeenCalledTimes(3);
    }, 10000);
  });

  describe('createKey', () => {
    it('should create a key from string arguments', () => {
      const key = createKey('test', 'key');
      expect(key).toBe('test:key');
    });

    it('should create a key from object arguments with sorted keys', () => {
      const obj = { b: 2, a: 1, c: 3 };
      const key = createKey(obj);
      expect(key).toBe('{"a":1,"b":2,"c":3}');
    });
  });
});
