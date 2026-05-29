// SMPL-X has 55 joints. Order matches the model's full_pose concatenation:
// global_orient(1) + body(21) + jaw(1) + eyes(2) + left_hand(15) + right_hand(15).

export const SMPLX_NUM_JOINTS = 55;
export const SMPLX_NUM_VERTS = 10475;

export const JOINT_NAMES = [
  'pelvis', // 0
  'left_hip', // 1
  'right_hip', // 2
  'spine1', // 3
  'left_knee', // 4
  'right_knee', // 5
  'spine2', // 6
  'left_ankle', // 7
  'right_ankle', // 8
  'spine3', // 9
  'left_foot', // 10
  'right_foot', // 11
  'neck', // 12
  'left_collar', // 13
  'right_collar', // 14
  'head', // 15
  'left_shoulder', // 16
  'right_shoulder', // 17
  'left_elbow', // 18
  'right_elbow', // 19
  'left_wrist', // 20
  'right_wrist', // 21
  'jaw', // 22
  'left_eye', // 23
  'right_eye', // 24
  'left_index1', 'left_index2', 'left_index3', // 25-27
  'left_middle1', 'left_middle2', 'left_middle3', // 28-30
  'left_pinky1', 'left_pinky2', 'left_pinky3', // 31-33
  'left_ring1', 'left_ring2', 'left_ring3', // 34-36
  'left_thumb1', 'left_thumb2', 'left_thumb3', // 37-39
  'right_index1', 'right_index2', 'right_index3', // 40-42
  'right_middle1', 'right_middle2', 'right_middle3', // 43-45
  'right_pinky1', 'right_pinky2', 'right_pinky3', // 46-48
  'right_ring1', 'right_ring2', 'right_ring3', // 49-51
  'right_thumb1', 'right_thumb2', 'right_thumb3', // 52-54
] as const;

export const LEFT_HAND_JOINTS = Array.from({ length: 15 }, (_, i) => 25 + i);
export const RIGHT_HAND_JOINTS = Array.from({ length: 15 }, (_, i) => 40 + i);

export type JointControl = { index: number; label: string };

// Curated set of joints exposed individually in the Pose panel (hands are driven
// in aggregate via curl sliders, so the panel does not list 30 finger joints).
export const POSE_JOINT_GROUPS: { group: string; joints: JointControl[] }[] = [
  {
    group: 'Spine & Head',
    joints: [
      { index: 3, label: 'Spine (lower)' },
      { index: 6, label: 'Spine (mid)' },
      { index: 9, label: 'Spine (upper)' },
      { index: 12, label: 'Neck' },
      { index: 15, label: 'Head' },
      { index: 22, label: 'Jaw' },
    ],
  },
  {
    group: 'Left Arm',
    joints: [
      { index: 13, label: 'Collar' },
      { index: 16, label: 'Shoulder' },
      { index: 18, label: 'Elbow' },
      { index: 20, label: 'Wrist' },
    ],
  },
  {
    group: 'Right Arm',
    joints: [
      { index: 14, label: 'Collar' },
      { index: 17, label: 'Shoulder' },
      { index: 19, label: 'Elbow' },
      { index: 21, label: 'Wrist' },
    ],
  },
  {
    group: 'Left Leg',
    joints: [
      { index: 1, label: 'Hip' },
      { index: 4, label: 'Knee' },
      { index: 7, label: 'Ankle' },
      { index: 10, label: 'Foot' },
    ],
  },
  {
    group: 'Right Leg',
    joints: [
      { index: 2, label: 'Hip' },
      { index: 5, label: 'Knee' },
      { index: 8, label: 'Ankle' },
      { index: 11, label: 'Foot' },
    ],
  },
];
