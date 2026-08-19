import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ComboProductRepository } from './combo-product.repository';

/**
 * Retires combos whose promotion window has closed.
 *
 * Every other combo lifecycle rule is event-driven and owned by a DB trigger:
 * the assemblable ceiling moves when stock or items move, and a capped offer
 * retires itself the moment `sold_quantity` reaches `offered_quantity`.
 * Expiry is the exception — nothing writes the row when the clock passes
 * `ends_at`, so a trigger can never fire for it. Something has to go looking.
 *
 * **This sweep is not what makes an expired combo stop selling.** The
 * storefront gate (`ComboProductRepository.publicVisibilityWhere`) and the
 * order validator both test the window live, per request, so a promotion is
 * unbuyable the instant it ends regardless of when this last ran. What the
 * sweep provides is a *stored* `status` that stays honest: without it the
 * admin table would show ended promotions sitting at ACTIVE forever, and
 * `status` would quietly stop meaning what it says.
 *
 * That split is deliberate. Correctness lives on the read path where it
 * cannot drift; bookkeeping lives here where a missed run costs nothing but a
 * stale badge until the next one.
 */
@Injectable()
export class ComboExpiryService {
  private readonly logger = new Logger(ComboExpiryService.name);

  constructor(
    private readonly comboProductRepository: ComboProductRepository,
  ) {}

  /**
   * Hourly. The interval is a bookkeeping-lag budget, not a correctness one —
   * see the class doc — so it is tuned for cheapness rather than freshness. A
   * shorter one would buy nothing a customer can observe.
   *
   * `name` is set so the job can be found and controlled through
   * `SchedulerRegistry` (paused during a migration window, triggered by hand
   * from a maintenance script) without reaching for its generated key.
   */
  @Cron(CronExpression.EVERY_HOUR, { name: 'combo-expiry-sweep' })
  async sweepExpiredCombos(): Promise<void> {
    try {
      const deactivated =
        await this.comboProductRepository.deactivateExpiredCombos();

      //* ONLY LOGGED WHEN SOMETHING ACTUALLY MOVED. AN HOURLY "swept 0 combos"
      //* LINE IS 24 ENTRIES A DAY OF PURE NOISE, AND IT IS EXACTLY THE KIND OF
      //* NOISE THAT TRAINS PEOPLE TO STOP READING THE LOG THE ONE TIME IT
      //* MATTERS.
      if (deactivated > 0) {
        this.logger.log(
          `Expiry sweep deactivated ${deactivated} combo${deactivated === 1 ? '' : 's'} past their end date`,
        );
      }
    } catch (error) {
      //* SWALLOWED ON PURPOSE. AN UNHANDLED REJECTION OUT OF A @Cron HANDLER
      //* TAKES DOWN THE PROCESS UNDER Node'S DEFAULT POLICY, AND A TRANSIENT DB
      //* BLIP MUST NOT KILL AN API SERVER OVER A BOOKKEEPING JOB. THE NEXT RUN
      //* PICKS UP EXACTLY THE SAME ROWS — THE SWEEP IS IDEMPOTENT AND HOLDS NO
      //* STATE BETWEEN RUNS.
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Combo expiry sweep failed: ${message}`);
    }
  }
}
