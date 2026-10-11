import type { DataApi } from "./core";
import { getLinkableDocuments } from "./local-actions";
import {
  addTodoApi, updateTodoApi, archiveTodoApi, restoreTodoApi, getArchivedTodosApi, addWikiSectionApi, createInterviewApi, getAnswerDoc, getAnswerSummaries, getApplicationsList, getCompanySitesList,
  getInterviewsList, getOverview, getQuestionIndex, getReview, getWikiDocument, isEditableDoc, resolveWikiTarget,
  saveApplicationApi, saveWikiSectionApi, setTodoDoneApi, getAnswerPins, setAnswerPin, getLearningStatus, generateLearning, saveLearning, archiveApplication, restoreApplication, getArchivedApplications,
} from "./local-actions";

export const localApi: DataApi = {
  mode: "local",
  getLinkableDocuments,
  getOverview,
  getInterviews: getInterviewsList,
  getQuestionIndex,
  getReview,
  getAnswerSummaries,
  getAnswerDoc,
  resolveWikiTarget,
  getWikiDocument,
  isEditableDoc,
  saveWikiSection: saveWikiSectionApi,
  addWikiSection: addWikiSectionApi,
  getApplications: getApplicationsList,
  getCompanySites: getCompanySitesList,
  saveApplication: saveApplicationApi,
  archiveApplication, restoreApplication, getArchivedApplications,
  createInterview: createInterviewApi,
  addTodo: addTodoApi,
  updateTodo: updateTodoApi,
  archiveTodo: archiveTodoApi,
  restoreTodo: restoreTodoApi,
  getArchivedTodos: getArchivedTodosApi,
  setTodoDone: setTodoDoneApi,
  getAnswerPins, setAnswerPin, getLearningStatus, generateLearning, saveLearning,
};
