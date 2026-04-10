import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Global rate-limit guard.
 * Limits: 10 requests/minute globally, configurable per-route with @Throttle().
 */
@Injectable()
export class NigarThrottleGuard extends ThrottlerGuard {}
