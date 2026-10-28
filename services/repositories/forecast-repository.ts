import {
  clearForecast,
  deleteForecastCompetence,
  getForecastSummary,
  getLastForecastImport,
  listForecastEntries,
} from "@/services/actions/forecast.actions";

/** Fachada sobre as Server Actions (ver vault-repository). */
export const forecastRepository = {
  list: listForecastEntries,
  summary: getForecastSummary,
  lastImport: getLastForecastImport,
  removeCompetence: deleteForecastCompetence,
  clear: clearForecast,
};
