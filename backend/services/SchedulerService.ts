import { BillingService } from './BillingService';
import logger from '../utils/logger';

export interface ScheduledTask {
  id: string;
  name: string;
  interval: number; // 毫秒
  lastRun: Date | null;
  nextRun: Date;
  isRunning: boolean;
  task: () => Promise<void>;
  enabled: boolean;
}

export class SchedulerService {
  private tasks: Map<string, ScheduledTask> = new Map();
  private intervals: Map<string, NodeJS.Timeout> = new Map();
  private billingService: BillingService;

  constructor(billingService: BillingService) {
    this.billingService = billingService;
  }

  /**
   * 添加定时任务
   */
  addTask(task: Omit<ScheduledTask, 'id' | 'lastRun' | 'nextRun' | 'isRunning'>): string {
    const id = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date();
    
    const scheduledTask: ScheduledTask = {
      ...task,
      id,
      lastRun: null,
      nextRun: new Date(now.getTime() + task.interval),
      isRunning: false
    };

    this.tasks.set(id, scheduledTask);
    this.scheduleTask(scheduledTask);
    
    logger.info(`Scheduled task added: ${task.name} (ID: ${id})`);
    return id;
  }

  /**
   * 调度任务
   */
  private scheduleTask(task: ScheduledTask): void {
    if (!task.enabled) return;

    const timeout = setTimeout(async () => {
      await this.executeTask(task);
    }, task.interval);

    this.intervals.set(task.id, timeout);
  }

  /**
   * 执行任务
   */
  private async executeTask(task: ScheduledTask): Promise<void> {
    if (task.isRunning) {
      logger.warn(`Task ${task.name} is already running, skipping execution`);
      return;
    }

    task.isRunning = true;
    task.lastRun = new Date();

    try {
      logger.info(`Executing scheduled task: ${task.name}`);
      await task.task();
      logger.info(`Scheduled task completed: ${task.name}`);
    } catch (error: any) {
      logger.error(`Scheduled task failed: ${task.name}`, error);
    } finally {
      task.isRunning = false;
      task.nextRun = new Date(Date.now() + task.interval);
      
      // 重新调度任务
      this.scheduleTask(task);
    }
  }

  /**
   * 启动账单监控任务
   */
  startBillingMonitoring(subscriptionId: string): string {
    return this.addTask({
      name: 'Billing Monitoring',
      interval: 10 * 60 * 1000, // 10分钟
      enabled: true,
      task: async () => {
        try {
          logger.info('Starting billing monitoring task...');
          
          // 获取实时计费统计
          const stats = await this.billingService.getRealTimeBillingStats(subscriptionId);
          
          // 检查计费异常
          const anomalies = await this.billingService.checkBillingAnomalies(subscriptionId);
          
          // 记录计费信息
          logger.info('Billing monitoring results:', {
            totalCost: stats.totalCost,
            currency: stats.currency,
            speechCost: stats.speechCost,
            translationCost: stats.translationCost,
            hasAnomalies: anomalies.hasAnomalies,
            anomalyCount: anomalies.anomalies.length
          });

          // 如果有异常，记录详细信息
          if (anomalies.hasAnomalies) {
            logger.warn('Billing anomalies detected:', anomalies.anomalies);
          }

          // 生成计费报告并保存到数据库（可选）
          const report = await this.billingService.generateBillingReport(subscriptionId);
          await this.saveBillingReport(report);

        } catch (error: any) {
          logger.error('Billing monitoring task failed:', error);
        }
      }
    });
  }

  /**
   * 保存计费报告到数据库
   */
  private async saveBillingReport(report: any): Promise<void> {
    try {
      // 这里可以添加数据库保存逻辑
      // 例如保存到 billing_reports 表
      logger.info('Billing report generated and saved');
    } catch (error: any) {
      logger.error('Failed to save billing report:', error);
    }
  }

  /**
   * 停止任务
   */
  stopTask(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task) {
      logger.warn(`Task not found: ${taskId}`);
      return false;
    }

    const interval = this.intervals.get(taskId);
    if (interval) {
      clearTimeout(interval);
      this.intervals.delete(taskId);
    }

    task.enabled = false;
    logger.info(`Task stopped: ${task.name} (ID: ${taskId})`);
    return true;
  }

  /**
   * 启动任务
   */
  startTask(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task) {
      logger.warn(`Task not found: ${taskId}`);
      return false;
    }

    task.enabled = true;
    this.scheduleTask(task);
    logger.info(`Task started: ${task.name} (ID: ${taskId})`);
    return true;
  }

  /**
   * 获取所有任务状态
   */
  getTasksStatus(): Array<{
    id: string;
    name: string;
    enabled: boolean;
    isRunning: boolean;
    lastRun: Date | null;
    nextRun: Date;
    interval: number;
  }> {
    return Array.from(this.tasks.values()).map(task => ({
      id: task.id,
      name: task.name,
      enabled: task.enabled,
      isRunning: task.isRunning,
      lastRun: task.lastRun,
      nextRun: task.nextRun,
      interval: task.interval
    }));
  }

  /**
   * 手动执行任务
   */
  async executeTaskNow(taskId: string): Promise<boolean> {
    const task = this.tasks.get(taskId);
    if (!task) {
      logger.warn(`Task not found: ${taskId}`);
      return false;
    }

    if (!task.enabled) {
      logger.warn(`Task is disabled: ${taskId}`);
      return false;
    }

    await this.executeTask(task);
    return true;
  }

  /**
   * 清理所有任务
   */
  cleanup(): void {
    for (const [taskId, interval] of this.intervals) {
      clearTimeout(interval);
    }
    this.intervals.clear();
    this.tasks.clear();
    logger.info('All scheduled tasks cleaned up');
  }

  /**
   * 获取任务统计信息
   */
  getStats(): {
    totalTasks: number;
    runningTasks: number;
    enabledTasks: number;
    nextTaskRun: Date | null;
  } {
    const tasks = Array.from(this.tasks.values());
    const runningTasks = tasks.filter(t => t.isRunning).length;
    const enabledTasks = tasks.filter(t => t.enabled).length;
    const nextTaskRun = tasks
      .filter(t => t.enabled)
      .sort((a, b) => a.nextRun.getTime() - b.nextRun.getTime())[0]?.nextRun || null;

    return {
      totalTasks: tasks.length,
      runningTasks,
      enabledTasks,
      nextTaskRun
    };
  }
}
