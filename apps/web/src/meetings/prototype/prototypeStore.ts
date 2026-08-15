import { create } from "zustand";

type MeetingReviewPrototypeState = {
  readonly selectedId: string | null;
  readonly search: string;
  selectMeeting(id: string | null): void;
  setSearch(search: string): void;
};

export const useMeetingReviewPrototypeStore = create<MeetingReviewPrototypeState>()((set) => ({
  selectedId: null,
  search: "",
  selectMeeting: (id) => set({ selectedId: id }),
  setSearch: (search) => set({ search }),
}));
