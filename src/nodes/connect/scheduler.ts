import { DeviceParameters, SchedulerDay } from '@/lib/types';

/**
 * Проверяет, разрешено ли воспроизведение в текущее время по расписанию.
 * Возвращает [true] если разрешено, [false, phrase] если нет.
 */
export function checkScheduler(parameters: DeviceParameters, timestamp: number): [true] | [false, string] {
  const schedule: SchedulerDay[] = parameters.sheduler || [];
  const date = new Date(timestamp);
  const daySchedule = schedule.find((el) => el.dayNumber === date.getDay());
  if (!daySchedule) return [true];
  const currentMinutes = date.getHours() * 60 + date.getMinutes();
  const timeMin = parseInt(daySchedule.from, 10);
  const timeMax = parseInt(daySchedule.to, 10);
  if (currentMinutes >= timeMin && currentMinutes < timeMax) {
    return [true];
  }
  return [false, daySchedule.phrase];
}
