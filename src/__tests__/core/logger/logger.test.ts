import { logger } from '../../../core/logger/logger';

describe('Logger', () => {
  beforeEach(() => {
    logger.clear();
  });

  afterEach(() => {
    logger.clear();
  });

  it('notifies subscribers when logs are cleared', () => {
    const listener = jest.fn();
    const unsubscribe = logger.subscribe(listener);

    logger.info('Test', 'message');
    listener.mockClear();

    logger.clear();

    expect(listener).toHaveBeenCalledTimes(1);
    expect(logger.getLogs()).toEqual([]);

    unsubscribe();
  });
});
