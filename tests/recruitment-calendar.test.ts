import test from "node:test";
import assert from "node:assert/strict";
import { calendarEvents, compareEvents, monthDays, scheduleTime, shanghaiDate, shiftMonth, validDay, validSchedule } from "../src/lib/recruitment-calendar";
import type { Application } from "../src/lib/types";

test("calendar uses Beijing dates, Monday-first grid and safe year transitions", () => {
  assert.equal(shanghaiDate(new Date("2026-10-08T17:00:00Z")), "2026-10-09");
  assert.equal(monthDays("2026-10")[0], "2026-09-28");
  assert.equal(monthDays("2026-10").length,42);
  assert.equal(shiftMonth("2026-12",1),"2027-01");
  assert.equal(shiftMonth("2026-01",-1),"2025-12");
  assert.equal(validDay("2026-02-30"), "");
  assert.equal(validDay("2028-02-29"), "2028-02-29");
  assert.equal(validDay("2026-10-09T10:00"), "2026-10-09");
});
test("minute-level schedules preserve old dates and sort timed tasks before unspecified time", () => {
  for (const invalid of ["2026-02-30T09:00", "2026-10-09T24:00", "2026-10-09T14:60", "2026-10-09junk"]) assert.equal(validSchedule(invalid),false);
  assert.equal(validSchedule("2026-10-09T14:30"),true);
  assert.equal(validSchedule("2026-10-09"),true);
  assert.equal(validSchedule(""),true);
  assert.equal(scheduleTime("2026-10-09"),"");
  assert.equal(scheduleTime("2026-10-09T14:30"),"14:30");
  const items=calendarEvents(["", "14:30", "09:15"].map((time,index)=>({id:String(index),title:"面试",due_date:`2026-10-09${time ? `T${time}` : ""}`,done:false,interview_id:""})),[]).sort(compareEvents);
  assert.deepEqual(items.map(item=>item.time),["09:15","14:30",""]);
  assert.ok(items.every(item=>item.date === "2026-10-09"));
});
test("calendar keeps todo completion and undated tasks, without inferring interview dates", () => {
  const app = { id:"a",company:"滴滴",role:"AI产品",status:"HR",next_action:"HR沟通",next_action_date:"2026-10-12" } as Application;
  const result=calendarEvents([{id:"a",title:"复习Agent",due_date:"",done:true,interview_id:""}], [app,{...app,id:"b",status:"结束"},{...app,id:"c",next_action:""}]);
  assert.equal(result.length,2);
  assert.equal(result[0].date,"");
  assert.equal(result[0].done,true);
  assert.equal(result[1].kind,"HR沟通");
  assert.notEqual(result[0].id,result[1].id);
  assert.equal(calendarEvents([], [{...app,next_action_date:""}])[0].date, "");
  assert.equal(calendarEvents([{id:"x",title:"【复习】准备面试",due_date:"",done:false,interview_id:""}],[])[0].kind,"复习");
});
