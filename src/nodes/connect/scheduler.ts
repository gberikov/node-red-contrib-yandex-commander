import { DeviceParameters, SchedulerDay } from '@/lib/types';

/**
 * Проверяет, разрешено ли воспроизведение в текущее время по расписанию.
 * Возвращает [true] если разрешено, [false, phrase] если нет.
 */
export function checkScheduler(parameters: DeviceParameters, timestamp: number): [true] | [false, string] {
  const schedule: SchedulerDay[] = parameters.sheduler || [];
  const date = new Date(timestamp);
  const currentMinutes = date.getDay() * 1000 + date.getHours() * 60 + date.getMinutes();
  const daySchedule = schedule.find((el) => el.dayNumber === date.getDay());
  if (!daySchedule) return [true];
  const timeMin = daySchedule.dayNumber * 1000 + parseInt(daySchedule.from);
  const timeMax = daySchedule.dayNumber * 1000 + parseInt(daySchedule.to);
  if (currentMinutes >= timeMin && currentMinutes < timeMax) {
    return [true];
  }
  return [false, daySchedule.phrase];
}
