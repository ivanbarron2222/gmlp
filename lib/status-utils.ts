/**
 * Status badge color and styling utilities for the LIS Portal
 */

export type Status = 'pending' | 'processing' | 'completed' | 'released' | 'critical' | 'urgent' | 'routine' | 'done' | 'in-progress' | 'normal-risk';

export const statusColors: Record<Status, { bg: string; text: string; border: string }> = {
  pending: {
    bg: 'bg-gray-100',
    text: 'text-gray-700',
    border: 'border-gray-300',
  },
  processing: {
    bg: 'bg-blue-100',
    text: 'text-blue-700',
    border: 'border-blue-300',
  },
  completed: {
    bg: 'bg-green-100',
    text: 'text-green-700',
    border: 'border-green-300',
  },
  released: {
    bg: 'bg-green-100',
    text: 'text-green-700',
    border: 'border-green-300',
  },
  critical: {
    bg: 'bg-red-100',
    text: 'text-red-700',
    border: 'border-red-300',
  },
  urgent: {
    bg: 'bg-orange-100',
    text: 'text-orange-700',
    border: 'border-orange-300',
  },
  routine: {
    bg: 'bg-gray-100',
    text: 'text-gray-700',
    border: 'border-gray-300',
  },
  done: {
    bg: 'bg-green-100',
    text: 'text-green-700',
    border: 'border-green-300',
  },
  'in-progress': {
    bg: 'bg-blue-100',
    text: 'text-blue-700',
    border: 'border-blue-300',
  },
  'normal-risk': {
    bg: 'bg-teal-100',
    text: 'text-teal-700',
    border: 'border-teal-300',
  },
};

export const statusLabels: Record<Status, string> = {
  pending: 'Pending',
  processing: 'Processing',
  completed: 'Completed',
  released: 'Released',
  critical: 'Critical',
  urgent: 'Urgent',
  routine: 'Routine',
  done: 'Done',
  'in-progress': 'In Progress',
  'normal-risk': 'Normal Risk',
};
