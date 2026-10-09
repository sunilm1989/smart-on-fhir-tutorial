(function(window, document) {
  'use strict';

  var SVG_NS = 'http://www.w3.org/2000/svg';
  var WIDTH = 1200;
  var HEIGHT = 680;
  var STYLE_ID = 'smart-ecg-styles';
  var EVENT_NAME = 'CARDIOLOGY_VIEWER_EVENT';
  var SHOW_EVENT_ALERTS = false;
  var currentStudyId = '';
  var dirtyDataSent = false;
  var ECG_INTERPRETATION_SUGGESTIONS = [
    'NORMAL SINUS RHYTHM',
    'SINUS RHYTHM',
    'SINUS ARRHYTHMIA',
    'SINUS BRADYCARDIA',
    'SINUS TACHYCARDIA',
    'NORMAL ECG',
    'ABNORMAL ECG',
    'BORDERLINE ECG',
    'FIRST DEGREE AV BLOCK',
    'RIGHT BUNDLE BRANCH BLOCK',
    'LEFT BUNDLE BRANCH BLOCK',
    'NONSPECIFIC ST ABNORMALITY',
    'ST ELEVATION, CONSIDER ACUTE INFARCT',
    'ST DEPRESSION, CONSIDER ISCHEMIA',
    'T WAVE ABNORMALITY, CONSIDER ISCHEMIA',
    'LEFT AXIS DEVIATION',
    'RIGHT AXIS DEVIATION',
    'LEFT VENTRICULAR HYPERTROPHY',
    'ATRIAL FIBRILLATION',
    'ATRIAL FLUTTER'
  ];

  var LEADS = [
    { name: 'I', row: 0, col: 0, p: 0.13, q: -0.11, r: 0.95, s: -0.28, t: 0.34, gain: 1, seed: 1 },
    { name: 'aVR', row: 0, col: 1, p: -0.08, q: 0.07, r: -0.75, s: 0.22, t: -0.22, gain: 1, seed: 2 },
    { name: 'V1', row: 0, col: 2, p: 0.05, q: -0.06, r: 0.25, s: -1.05, t: -0.07, gain: 1, seed: 3 },
    { name: 'V4', row: 0, col: 3, p: 0.1, q: -0.08, r: 0.82, s: -0.18, t: 0.24, gain: 1, seed: 4 },
    { name: 'II', row: 1, col: 0, p: 0.14, q: -0.12, r: 1, s: -0.3, t: 0.28, gain: 1, seed: 5 },
    { name: 'aVL', row: 1, col: 1, p: 0.05, q: -0.06, r: 0.32, s: -0.1, t: 0.12, gain: 1, seed: 6 },
    { name: 'V2', row: 1, col: 2, p: 0.07, q: -0.08, r: 0.44, s: -1.25, t: 0.12, gain: 1, seed: 7 },
    { name: 'V5', row: 1, col: 3, p: 0.12, q: -0.09, r: 0.95, s: -0.16, t: 0.24, gain: 1, seed: 8 },
    { name: 'III', row: 2, col: 0, p: -0.04, q: -0.04, r: 0.28, s: -0.16, t: -0.08, gain: 1, seed: 9 },
    { name: 'aVF', row: 2, col: 1, p: 0.08, q: -0.08, r: 0.66, s: -0.18, t: 0.12, gain: 1, seed: 10 },
    { name: 'V3', row: 2, col: 2, p: 0.09, q: -0.09, r: 0.62, s: -0.42, t: 0.18, gain: 1, seed: 11 },
    { name: 'V6', row: 2, col: 3, p: 0.1, q: -0.08, r: 0.86, s: -0.14, t: 0.22, gain: 1, seed: 12 }
  ];

  var RHYTHM = { name: 'II', row: 3, col: 0, p: 0.14, q: -0.12, r: 1, s: -0.28, t: 0.28, gain: 1, seed: 13 };

  function getJquery() {
    return window.jQuery || window.$;
  }

  function makeDeferred() {
    var jquery = getJquery();
    if (jquery && typeof jquery.Deferred === 'function') {
      return jquery.Deferred();
    }

    var doneCallbacks = [];
    var failCallbacks = [];
    var state = 'pending';
    var storedArgs = [];

    function run(callbacks, args) {
      for (var i = 0; i < callbacks.length; i += 1) {
        callbacks[i].apply(null, args);
      }
    }

    return {
      resolve: function() {
        if (state !== 'pending') {
          return;
        }

        state = 'resolved';
        storedArgs = arguments;
        run(doneCallbacks, arguments);
      },
      reject: function() {
        if (state !== 'pending') {
          return;
        }

        state = 'rejected';
        storedArgs = arguments;
        run(failCallbacks, arguments);
      },
      promise: function() {
        return this;
      },
      done: function(callback) {
        if (state === 'resolved') {
          callback.apply(null, storedArgs);
        } else if (state === 'pending') {
          doneCallbacks.push(callback);
        }

        return this;
      },
      fail: function(callback) {
        if (state === 'rejected') {
          callback.apply(null, storedArgs);
        } else if (state === 'pending') {
          failCallbacks.push(callback);
        }

        return this;
      },
      then: function(doneCallback, failCallback) {
        if (typeof doneCallback === 'function') {
          this.done(doneCallback);
        }

        if (typeof failCallback === 'function') {
          this.fail(failCallback);
        }

        return this;
      }
    };
  }

  function toDeferred(value) {
    var d = makeDeferred();

    if (!value) {
      d.resolve(null);
      return d.promise();
    }

    if (typeof value.done === 'function' && typeof value.fail === 'function') {
      return value;
    }

    if (typeof value.then === 'function') {
      value.then(function(result) {
        d.resolve(result);
      }, function(error) {
        d.reject(error);
      });
      return d.promise();
    }

    d.resolve(value);
    return d.promise();
  }

  function whenTwo(first, second, done, fail) {
    var firstDone = false;
    var secondDone = false;
    var firstValue;
    var secondValue;
    var rejected = false;

    function maybeDone() {
      if (!rejected && firstDone && secondDone) {
        done(firstValue, secondValue);
      }
    }

    toDeferred(first).done(function(value) {
      firstDone = true;
      firstValue = value;
      maybeDone();
    }).fail(function(error) {
      rejected = true;
      fail(error);
    });

    toDeferred(second).done(function(value) {
      secondDone = true;
      secondValue = value;
      maybeDone();
    }).fail(function(error) {
      rejected = true;
      fail(error);
    });
  }

  function setPvFrameworkPendingData(status) {
    try {
      if (window.external &&
          typeof window.external.DiscernObjectFactory === 'function') {
        var fwObj = window.external.DiscernObjectFactory('PVFRAMEWORKLINK');
        if (fwObj && typeof fwObj.SetPendingData === 'function') {
          fwObj.SetPendingData(status);
        }
      }
    } catch (e) {
      if (window.console && typeof window.console.log === 'function') {
        window.console.log('PVFRAMEWORKLINK is not available', e);
      }
    }
  }

  function safeSessionItem(key) {
    try {
      return window.sessionStorage && window.sessionStorage.getItem(key);
    } catch (e) {
      return null;
    }
  }

  function parseJson(value) {
    if (!value || typeof value !== 'string') {
      return null;
    }

    try {
      return JSON.parse(value);
    } catch (e) {
      return null;
    }
  }

  function hasLaunchIdentifiers(tokenResponse) {
    return !!(tokenResponse && (
      tokenResponse.patient ||
      tokenResponse.patientId ||
      tokenResponse.patient_id ||
      tokenResponse.cerner_accession ||
      tokenResponse.cerner_studyidentifier ||
      tokenResponse.cerner_studyIdentifier ||
      tokenResponse.studyIdentifier ||
      tokenResponse.accession ||
      tokenResponse.accessionNumber ||
      tokenResponse.accession_number
    ));
  }

  function getStoredTokenResponse() {
    var tokenResponse = parseJson(safeSessionItem('tokenResponse'));
    var statePayload;
    var key;
    var payload;
    var i;

    if (hasLaunchIdentifiers(tokenResponse)) {
      return tokenResponse;
    }

    if (tokenResponse && tokenResponse.state) {
      statePayload = parseJson(safeSessionItem(tokenResponse.state));
      if (statePayload && hasLaunchIdentifiers(statePayload.tokenResponse)) {
        return statePayload.tokenResponse;
      }
    }

    try {
      if (!window.sessionStorage) {
        return null;
      }

      for (i = 0; i < window.sessionStorage.length; i += 1) {
        key = window.sessionStorage.key(i);
        payload = parseJson(window.sessionStorage.getItem(key));
        if (payload && hasLaunchIdentifiers(payload.tokenResponse)) {
          return payload.tokenResponse;
        }
      }
    } catch (e) {
      return null;
    }

    return null;
  }

  function getTokenResponse(smart) {
    var tokenResponse;

    if (smart) {
      if (hasLaunchIdentifiers(smart.tokenResponse)) {
        return smart.tokenResponse;
      }

      if (smart.state && hasLaunchIdentifiers(smart.state.tokenResponse)) {
        return smart.state.tokenResponse;
      }

      if (typeof smart.getState === 'function') {
        try {
          tokenResponse = smart.getState('tokenResponse');
          if (hasLaunchIdentifiers(tokenResponse)) {
            return tokenResponse;
          }
        } catch (e) {
        }
      }
    }

    return getStoredTokenResponse() || {};
  }

  function firstTokenValue(smart, names) {
    var tokenResponse = getTokenResponse(smart);
    var i;
    var value;

    for (i = 0; i < names.length; i += 1) {
      value = tokenResponse[names[i]];
      if (value !== undefined && value !== null && value !== '') {
        return String(value);
      }
    }

    return '';
  }

  function getQueryParam(name) {
    var search = window.location.search || '';
    var pairs;
    var i;
    var parts;

    if (search.charAt(0) === '?') {
      search = search.substring(1);
    }

    if (!search) {
      return '';
    }

    pairs = search.split('&');
    for (i = 0; i < pairs.length; i += 1) {
      parts = pairs[i].split('=');
      if (decodeURIComponent(parts[0] || '').toLowerCase() === name.toLowerCase()) {
        return decodeURIComponent((parts[1] || '').replace(/\+/g, ' '));
      }
    }

    return '';
  }

  function getStudyId(smart) {
    return getQueryParam('studyId') ||
      getQueryParam('studyID') ||
      getQueryParam('study_id') ||
      getQueryParam('studyIdentifier') ||
      getQueryParam('study_identifier') ||
      getQueryParam('cerner_accession') ||
      getQueryParam('cerner_studyidentifier') ||
      getQueryParam('cerner_studyIdentifier') ||
      getQueryParam('cerner_study_identifier') ||
      getQueryParam('__accession') ||
      getQueryParam('__studyIdentifier') ||
      getQueryParam('__study_identifier') ||
      getQueryParam('accession') ||
      getQueryParam('accessionNumber') ||
      getQueryParam('accession_number') ||
      firstTokenValue(smart, [
        'cerner_accession',
        'accession',
        'accessionNumber',
        'accession_number',
        'cerner_studyidentifier',
        'cerner_studyIdentifier',
        'studyIdentifier',
        'study_id'
      ]) ||
      safeSessionItem('smart_ecg_study_id') ||
      '';
  }

  function setCurrentStudyId(studyId) {
    currentStudyId = studyId || '';
  }

  function getCurrentStudyId() {
    return currentStudyId ||
      getUiText('ecg-accession') ||
      getStudyId() ||
      getUiText('ecg-patient-id') ||
      'UNKNOWN_STUDY';
  }

  function createEventDetail(action, studyId, data) {
    return {
      action: action,
      context: {
        studyId: studyId,
        data: data
      }
    };
  }

  function logTroubleshooting(message, data) {
    if (window.console && typeof window.console.log === 'function') {
      window.console.log('[SMART ECG Viewer] ' + message, data || '');
    }
  }

  function sendCardiologyViewerEvent(action, data) {
    var detail = createEventDetail(action, getCurrentStudyId(), data === undefined ? '' : data);
    var payload = {
      type: EVENT_NAME,
      detail: detail
    };
    var event;

    logTroubleshooting('event triggered: ' + action, payload);
    updateEventMonitor(action, detail.context.studyId, detail.context.data);

    if (SHOW_EVENT_ALERTS) {
      window.alert(
        EVENT_NAME + '\n' +
        'Action: ' + action + '\n' +
        'Study ID: ' + detail.context.studyId + '\n' +
        'Data: ' + String(detail.context.data)
      );
    }

    try {
      event = new window.CustomEvent(EVENT_NAME, { detail: detail });
      window.dispatchEvent(event);
      logTroubleshooting('CustomEvent dispatched: ' + EVENT_NAME, detail);
    } catch (e) {
      if (document.createEvent) {
        event = document.createEvent('CustomEvent');
        event.initCustomEvent(EVENT_NAME, false, false, detail);
        window.dispatchEvent(event);
        logTroubleshooting('legacy CustomEvent dispatched: ' + EVENT_NAME, detail);
      }
    }

    try {
      if (window.parent && window.parent !== window && typeof window.parent.postMessage === 'function') {
        window.parent.postMessage(payload, '*');
        logTroubleshooting('postMessage sent to parent', payload);
      } else {
        logTroubleshooting('postMessage skipped because no parent frame is available', payload);
      }
    } catch (postMessageError) {
      if (window.console && typeof window.console.log === 'function') {
        window.console.log('[SMART ECG Viewer] unable to post cardiology viewer event', postMessageError);
      }
    }
  }

  function hasSmartContext() {
    var search = window.location.search || '';
    var hash = window.location.hash || '';

    return search.indexOf('code=') > -1 ||
      search.indexOf('state=') > -1 ||
      search.indexOf('launch=') > -1 ||
      search.indexOf('iss=') > -1 ||
      search.indexOf('fhirServiceUrl=') > -1 ||
      search.indexOf('patientId=') > -1 ||
      !!getStudyId() ||
      hash.indexOf('access_token=') > -1 ||
      hash.indexOf('state=') > -1 ||
      !!safeSessionItem('tokenResponse');
  }

  function defaultPatient() {
    return {
      fname: 'Patient',
      lname: 'Demo',
      gender: 'Male',
      birthdate: '1989-04-05',
      patientId: 'SMART',
      race: '--',
      accountNumber: '577590',
      accession: 'ECG-DEMO-0001',
      performedAt: new Date(),
      height: '178 cm',
      weight: '--',
      systolicbp: '--',
      diastolicbp: '--',
      ldl: '--',
      hdl: '--',
      sourceStatus: '',
      interpretation: [
        '1438--DEMO READER',
        'NORMAL SINUS RHYTHM WITH SINUS ARRHYTHMIA',
        'NORMAL ECG',
        'NO PREVIOUS ECGS AVAILABLE',
        'Normal ECG',
        'INCOMPLETE ANALYSIS DUE TO MISSING DATA IN PRECORDIAL LEAD(S)',
        'SINUS RHYTHM',
        'SINUS ARRHYTHMIA'
      ].join('\n')
    };
  }

  function compactArrayValue(value) {
    if (Object.prototype.toString.call(value) === '[object Array]') {
      return value.join(' ');
    }

    return value || '';
  }

  function capitalize(value) {
    if (!value) {
      return '--';
    }

    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  function getPrimaryIdentifier(patient) {
    if (!patient) {
      return '';
    }

    if (patient.id) {
      return patient.id;
    }

    if (patient.identifier && patient.identifier.length) {
      return patient.identifier[0].value || '';
    }

    return '';
  }

  function encodeSearchValue(value) {
    return encodeURIComponent(value || '');
  }

  function buildSearchPath(resourceType, query) {
    var parts = [];
    var key;

    for (key in query) {
      if (Object.prototype.hasOwnProperty.call(query, key) &&
          query[key] !== undefined &&
          query[key] !== null &&
          query[key] !== '') {
        parts.push(encodeURIComponent(key) + '=' + encodeSearchValue(query[key]));
      }
    }

    return resourceType + (parts.length ? '?' + parts.join('&') : '');
  }

  function requestFhir(smart, path, requestOptions) {
    if (smart && typeof smart.request === 'function') {
      return smart.request(path, requestOptions || {});
    }

    return null;
  }

  function fetchAllResources(smart, resourceType, query, patientId) {
    var request = requestFhir(smart, buildSearchPath(resourceType, query), {
      flat: true,
      pageLimit: 0
    });
    var api = smart && smart.api;

    if (request) {
      return request;
    }

    if (smart &&
        smart.patient &&
        smart.patient.api &&
        typeof smart.patient.api.fetchAll === 'function') {
      api = smart.patient.api;
    }

    if (!api || typeof api.fetchAll !== 'function') {
      return [];
    }

    return api.fetchAll({
      type: resourceType,
      patient: patientId || undefined,
      query: query
    });
  }

  function getPatientName(patient) {
    var name = patient && patient.name && patient.name.length ? patient.name[0] : {};
    return {
      first: compactArrayValue(name.given),
      last: compactArrayValue(name.family)
    };
  }

  function observationList(observations) {
    if (!observations) {
      return [];
    }

    if (Object.prototype.toString.call(observations) === '[object Array]') {
      return observations;
    }

    if (observations.entry && observations.entry.length) {
      var list = [];
      for (var i = 0; i < observations.entry.length; i += 1) {
        list.push(observations.entry[i].resource || observations.entry[i]);
      }
      return list;
    }

    return [];
  }

  function observationHasCode(observation, code) {
    var codings = observation && observation.code && observation.code.coding;
    if (!codings || !codings.length) {
      return false;
    }

    for (var i = 0; i < codings.length; i += 1) {
      if (codings[i].code === code) {
        return true;
      }
    }

    return false;
  }

  function findObservation(observations, code) {
    var list = observationList(observations);
    for (var i = 0; i < list.length; i += 1) {
      if (observationHasCode(list[i], code)) {
        return list[i];
      }
    }

    return null;
  }

  function getQuantityValueAndUnit(observation) {
    if (!observation || !observation.valueQuantity) {
      return '--';
    }

    if (observation.valueQuantity.value === undefined ||
        observation.valueQuantity.value === null) {
      return '--';
    }

    return observation.valueQuantity.value +
      (observation.valueQuantity.unit ? ' ' + observation.valueQuantity.unit : '');
  }

  function getBloodPressureValue(observations, typeOfPressure) {
    var bp = findObservation(observations, '55284-4');
    if (!bp || !bp.component || !bp.component.length) {
      return '--';
    }

    for (var i = 0; i < bp.component.length; i += 1) {
      if (observationHasCode({ code: bp.component[i].code }, typeOfPressure)) {
        return getQuantityValueAndUnit({ valueQuantity: bp.component[i].valueQuantity });
      }
    }

    return '--';
  }

  function normalizePatient(patient, observations, studyContext) {
    var fallback = defaultPatient();
    var name = getPatientName(patient);
    var contextPatientId = studyContext && studyContext.patientId ? studyContext.patientId : '';
    var patientId = contextPatientId || getPrimaryIdentifier(patient);
    var height = getQuantityValueAndUnit(findObservation(observations, '8302-2'));
    var hdl = getQuantityValueAndUnit(findObservation(observations, '2085-9'));
    var ldl = getQuantityValueAndUnit(findObservation(observations, '2089-1'));
    var systolic = getBloodPressureValue(observations, '8480-6');
    var diastolic = getBloodPressureValue(observations, '8462-4');
    var studyId = studyContext && studyContext.studyId ? studyContext.studyId : '';

    return {
      fname: name.first || fallback.fname,
      lname: name.last || fallback.lname,
      gender: capitalize(patient && patient.gender),
      birthdate: patient && patient.birthDate ? patient.birthDate : fallback.birthdate,
      patientId: patientId || fallback.patientId,
      race: fallback.race,
      accountNumber: fallback.accountNumber,
      accession: studyId || (patientId ? 'ECG-' + patientId : fallback.accession),
      performedAt: new Date(),
      height: height !== '--' ? height : fallback.height,
      weight: fallback.weight,
      systolicbp: systolic,
      diastolicbp: diastolic,
      ldl: ldl,
      hdl: hdl,
      sourceStatus: studyId ? 'SMART ECG Study' : 'SMART ECG',
      interpretation: fallback.interpretation
    };
  }

  function firstResource(result) {
    var list = observationList(result);
    return list.length ? list[0] : null;
  }

  function patientIdFromReference(reference) {
    var value = reference && reference.reference ? reference.reference : reference;
    var match;

    if (!value || typeof value !== 'string') {
      return '';
    }

    match = value.match(/Patient\/([^/?#]+)/i);
    if (match && match[1]) {
      return decodeURIComponent(match[1]);
    }

    return '';
  }

  function patientIdFromStudyResource(resource) {
    if (!resource) {
      return '';
    }

    return patientIdFromReference(resource.subject) ||
      patientIdFromReference(resource.patient) ||
      patientIdFromReference(resource.basedOn && resource.basedOn[0] && resource.basedOn[0].subject) ||
      '';
  }

  function getStudySearchAttempts(studyId) {
    return [
      { type: 'DiagnosticReport', query: { identifier: studyId } },
      { type: 'DiagnosticReport', query: { _id: studyId } },
      { type: 'Observation', query: { identifier: studyId } },
      { type: 'Observation', query: { _id: studyId } },
      { type: 'ImagingStudy', query: { identifier: studyId } },
      { type: 'ImagingStudy', query: { _id: studyId } },
      { type: 'DocumentReference', query: { identifier: studyId } },
      { type: 'DocumentReference', query: { _id: studyId } }
    ];
  }

  function searchStudyResource(smart, studyId) {
    var ret = makeDeferred();
    var attempts = getStudySearchAttempts(studyId);

    function next(index) {
      var attempt;

      if (index >= attempts.length) {
        ret.reject('No FHIR study resource found for study id ' + studyId);
        return;
      }

      attempt = attempts[index];
      try {
        toDeferred(fetchAllResources(smart, attempt.type, attempt.query)).done(function(result) {
          var resource = firstResource(result);
          var patientId = patientIdFromStudyResource(resource);

          if (resource && patientId) {
            ret.resolve({
              resource: resource,
              patientId: patientId,
              studyId: studyId,
              resourceType: attempt.type
            });
          } else {
            next(index + 1);
          }
        }).fail(function() {
          next(index + 1);
        });
      } catch (e) {
        next(index + 1);
      }
    }

    next(0);
    return ret.promise();
  }

  function fetchObservationsForPatient(smart, patientId) {
    var codes = [
      'http://loinc.org|8302-2',
      'http://loinc.org|8462-4',
      'http://loinc.org|8480-6',
      'http://loinc.org|2085-9',
      'http://loinc.org|2089-1',
      'http://loinc.org|55284-4'
    ];
    var query = {
      code: codes.join(',')
    };

    if (patientId) {
      query.patient = patientId;
    }

    if (smart &&
        smart.patient &&
        smart.patient.api &&
        typeof smart.patient.api.fetchAll === 'function' &&
        !smart.request) {
      return smart.patient.api.fetchAll({
        type: 'Observation',
        query: {
          code: {
            $or: codes
          }
        }
      });
    }

    return fetchAllResources(smart, 'Observation', query, patientId);
  }

  function getLaunchPatientId(smart) {
    if (smart && smart.patient) {
      if (typeof smart.patient === 'string') {
        return smart.patient;
      }

      if (smart.patient.id) {
        return smart.patient.id;
      }
    }

    return getQueryParam('patientId') ||
      getQueryParam('patient') ||
      firstTokenValue(smart, ['patient', 'patientId', 'patient_id']) ||
      '';
  }

  function readPatientById(smart, patientId) {
    var request = requestFhir(smart, 'Patient/' + encodeURIComponent(patientId));

    if (request) {
      return request;
    }

    if (!smart || typeof smart.get !== 'function' || !patientId) {
      return null;
    }

    return smart.get({
      resource: 'Patient',
      id: patientId
    });
  }

  function readPatientFromStudyId(smart, studyId) {
    var ret = makeDeferred();

    if (!studyId) {
      ret.reject('No study id supplied');
      return ret.promise();
    }

    searchStudyResource(smart, studyId).done(function(studyContext) {
      whenTwo(
        readPatientById(smart, studyContext.patientId),
        fetchObservationsForPatient(smart, studyContext.patientId),
        function(patient, observations) {
          ret.resolve(normalizePatient(patient, observations || [], studyContext));
        },
        function(error) {
          ret.reject(error);
        }
      );
    }).fail(function(error) {
      ret.reject(error);
    });

    return ret.promise();
  }

  function readPatientFromLaunchContext(smart, studyId) {
    var ret = makeDeferred();
    var patientId = getLaunchPatientId(smart);
    var patientRead;

    if (smart && smart.patient && typeof smart.patient.read === 'function') {
      patientRead = smart.patient.read();
    } else {
      patientRead = readPatientById(smart, patientId);
    }

    whenTwo(
      patientRead,
      fetchObservationsForPatient(smart, patientId),
      function(patient, observations) {
        ret.resolve(normalizePatient(patient, observations || [], {
          patientId: patientId,
          studyId: studyId
        }));
      },
      function(error) {
        ret.reject(error);
      }
    );

    return ret.promise();
  }

  function isFallbackName(patientData) {
    return !patientData ||
      ((patientData.fname || '') === 'Patient' && (patientData.lname || '') === 'Demo');
  }

  function studyMatchPatientData(patientData, smart) {
    var fallback = defaultPatient();
    var patientId = getLaunchPatientId(smart) ||
      (patientData && patientData.patientId) ||
      fallback.patientId;
    var data = {
      fname: patientData && patientData.fname ? patientData.fname : fallback.fname,
      lname: patientData && patientData.lname ? patientData.lname : fallback.lname,
      birthdate: patientData && patientData.birthdate ? patientData.birthdate : fallback.birthdate,
      patientId: patientId
    };

    if (patientId === '72423' && isFallbackName(data)) {
      data.fname = 'Paul';
      data.lname = 'Jhon';
      data.birthdate = '1989-04-05';
    }

    return data;
  }

  function patientDisplayName(patientData) {
    var first = patientData && patientData.fname ? patientData.fname : '';
    var last = patientData && patientData.lname ? patientData.lname : '';

    if (last && first) {
      return last + ', ' + first;
    }

    return last || first || '--';
  }

  function buildStudyMatchStudies(patientData) {
    var name = patientDisplayName(patientData);
    var patientId = patientData.patientId;
    var dob = formatDate(patientData.birthdate);

    return [
      {
        status: 'P',
        datePerformed: '10/7/2026  14:22:00',
        patientName: name.toLowerCase(),
        patientId: patientId,
        dob: dob,
        site: 'Joe Cardiovascular',
        readingProvider: 'card doctor',
        referringMd: 'FELLOW1 CV',
        type: 'ECG',
        location: 'CD:22784933'
      },
      {
        status: 'P',
        datePerformed: '10/7/2026  16:20:00',
        patientName: name,
        patientId: patientId,
        dob: dob,
        site: 'Joe Cardiovascular',
        readingProvider: '',
        referringMd: '',
        type: 'ECG',
        location: ''
      },
      {
        status: 'P',
        datePerformed: '10/7/2026  19:25:00',
        patientName: name.toLowerCase(),
        patientId: patientId,
        dob: dob,
        site: 'Joe Cardiovascular',
        readingProvider: '',
        referringMd: '',
        type: 'ECG',
        location: ''
      }
    ];
  }

  function buildStudyMatchOrders(patientData) {
    var name = patientDisplayName(patientData);
    var patientId = patientData.patientId;
    var dob = formatDate(patientData.birthdate);

    return [
      { patientName: name, patientId: patientId, dob: dob, date: '10/5/2026  08:32:00', status: 'Open', orderNumber: '1819241381', modality: 'ECG', site: 'Baseline West Medical Center' },
      { patientName: name, patientId: patientId, dob: dob, date: '10/4/2026  23:01:00', status: 'Open', orderNumber: '1819281581', modality: 'ECG', site: 'Baseline West Medical Center' },
      { patientName: name, patientId: patientId, dob: dob, date: '10/5/2026  23:04:00', status: 'Open', orderNumber: '1819281631', modality: 'ECG', site: 'Baseline West Medical Center' },
      { patientName: name, patientId: patientId, dob: dob, date: '10/6/2026  23:13:00', status: 'Open', orderNumber: '1819282057', modality: 'ECG', site: 'Baseline West Medical Center' },
      { patientName: name, patientId: patientId, dob: dob, date: '10/6/2026  23:43:00', status: 'Open', orderNumber: '1819282547', modality: 'ECG', site: 'Baseline West Medical Center' },
      { patientName: name, patientId: patientId, dob: dob, date: '10/6/2026  23:51:00', status: 'Open', orderNumber: '1819282741', modality: 'ECG', site: 'Baseline West Medical Center' },
      { patientName: name, patientId: patientId, dob: dob, date: '10/7/2026  00:50:00', status: 'Open', orderNumber: '1819283041', modality: 'ECG', site: 'Baseline West Medical Center' }
    ];
  }

  function buildStudyMatchContext(patientData, smart) {
    var data = studyMatchPatientData(patientData, smart);
    return {
      workflow: 'study-match',
      patient: data,
      patientId: data.patientId,
      patientName: patientDisplayName(data),
      studies: buildStudyMatchStudies(data),
      orders: buildStudyMatchOrders(data)
    };
  }

  function readStudyMatchContext(smart) {
    var ret = makeDeferred();
    var patientId = getLaunchPatientId(smart);
    var patientRead;

    if (smart && smart.patient && typeof smart.patient.read === 'function') {
      patientRead = smart.patient.read();
    } else {
      patientRead = readPatientById(smart, patientId);
    }

    toDeferred(patientRead).done(function(patient) {
      ret.resolve(buildStudyMatchContext(normalizePatient(patient, [], {
        patientId: patientId
      }), smart));
    }).fail(function(error) {
      if (window.console && typeof window.console.log === 'function') {
        window.console.log('FHIR patient read failed; using study match fallback data', error);
      }
      ret.resolve(buildStudyMatchContext({ patientId: patientId }, smart));
    });

    return ret.promise();
  }

  function applyLaunchIdentifiers(data, smart) {
    var patientId = getLaunchPatientId(smart);
    var studyId = getStudyId(smart);

    if (patientId) {
      data.patientId = patientId;
    }

    if (studyId) {
      data.accession = studyId;
    }

    return data;
  }

  function failToDemo(ret, reason, smart) {
    var demo = defaultPatient();
    if (reason) {
      demo.sourceStatus = reason;
    }
    applyLaunchIdentifiers(demo, smart);
    ret.resolve(demo);
  }

  window.extractData = function() {
    var ret = makeDeferred();

    setPvFrameworkPendingData(2);

    if (!window.FHIR ||
        !window.FHIR.oauth2 ||
        typeof window.FHIR.oauth2.ready !== 'function') {
      failToDemo(ret);
      return ret.promise();
    }

    if (!hasSmartContext()) {
      failToDemo(ret);
      return ret.promise();
    }

    try {
      var readyHandled = false;
      var handleReady = function(smart) {
        var studyId = getStudyId(smart);
        var patientId;

        if (readyHandled) {
          return;
        }
        readyHandled = true;

        setPvFrameworkPendingData(1);

        if (!smart) {
          failToDemo(ret, 'SMART launch unavailable');
          return;
        }

        patientId = getLaunchPatientId(smart);

        if (patientId && !studyId) {
          readStudyMatchContext(smart).done(function(context) {
            ret.resolve(context);
          }).fail(function() {
            ret.resolve(buildStudyMatchContext({ patientId: patientId }, smart));
          });
          return;
        }

        if (patientId) {
          readPatientFromLaunchContext(smart, studyId).done(function(patient) {
            ret.resolve(patient);
          }).fail(function(error) {
            if (window.console && typeof window.console.log === 'function') {
              window.console.log('FHIR patient read failed; using fallback ECG data', error);
            }
            failToDemo(ret, '', smart);
          });
          return;
        }

        if (studyId) {
          readPatientFromStudyId(smart, studyId).done(function(patient) {
            ret.resolve(patient);
          }).fail(function(error) {
            if (window.console && typeof window.console.log === 'function') {
              window.console.log('Study lookup failed; using fallback ECG data', error);
            }
            failToDemo(ret, 'Study not found', smart);
          });
          return;
        }

        failToDemo(ret, 'SMART launch without patient context', smart);
      };
      var handleError = function(error) {
        if (readyHandled) {
          return;
        }
        readyHandled = true;

        if (window.console && typeof window.console.log === 'function') {
          window.console.log('SMART launch failed; using fallback ECG data', error);
        }
        failToDemo(ret);
      };
      var readyResult;

      try {
        readyResult = window.FHIR.oauth2.ready();
      } catch (readyWithoutArgsError) {
        readyResult = window.FHIR.oauth2.ready(handleReady, handleError);
      }

      if (readyResult && typeof readyResult.then === 'function') {
        readyResult.then(handleReady, handleError);
      } else if (readyResult) {
        handleReady(readyResult);
      }
    } catch (e) {
      if (window.console && typeof window.console.log === 'function') {
        window.console.log('SMART launch exception; using fallback ECG data', e);
      }
      failToDemo(ret);
    }

    return ret.promise();
  };

  function cssText() {
    return [
      'html, body { height: 100%; }',
      'body.smart-ecg-body { margin: 0; background: #eef1f5; color: #202833; font-family: Arial, Helvetica, sans-serif; overflow: hidden; }',
      '.smart-ecg-app, .smart-ecg-app * { box-sizing: border-box; }',
      '.smart-ecg-app { display: -ms-grid; display: grid; -ms-grid-columns: minmax(620px, 1fr) 40rem; grid-template-columns: minmax(620px, 1fr) 40rem; height: 100vh; min-height: 640px; background: #fff; }',
      '.smart-ecg-viewer { display: -ms-grid; display: grid; -ms-grid-rows: 3rem 2.25rem minmax(0, 1fr); grid-template-rows: 3rem 2.25rem minmax(0, 1fr); min-width: 0; border-right: 1px solid #9aa5b4; }',
      '.smart-ecg-metrics { display: flex; align-items: stretch; min-width: 0; overflow: hidden; background: #f4f6f8; border-bottom: 1px solid #ccd2da; }',
      '.smart-ecg-metric { min-width: 4.5rem; padding: .34rem .45rem; border-right: 1px solid #d9dee5; line-height: 1.05; }',
      '.smart-ecg-metric-label { display: block; color: #5f6b7a; font-size: .7rem; font-weight: 700; }',
      '.smart-ecg-metric-value { display: block; margin-top: .12rem; color: #1d2733; font-size: .86rem; font-weight: 800; }',
      '.smart-ecg-metric.smart-ecg-severity { min-width: 7.25rem; background: #eef1f5; }',
      '.smart-ecg-toolbar { display: flex; align-items: center; gap: .18rem; padding: .18rem .35rem; background: #fff; border-bottom: 1px solid #d3d8df; }',
      '.smart-ecg-button { display: inline-flex; align-items: center; justify-content: center; width: 1.75rem; height: 1.75rem; padding: 0; color: #1f2d3d; background: #fff; border: 1px solid transparent; border-radius: 4px; font: inherit; cursor: default; }',
      '.smart-ecg-button:hover { background: #edf2f9; border-color: #c9d3e2; }',
      '.smart-ecg-close-button { color: #0d45bf; border-color: #c9d3e2; }',
      '.smart-ecg-toolbar-spacer { flex: 1 1 auto; }',
      '.smart-ecg-scale { color: #0d45bf; font-size: .9rem; font-weight: 800; }',
      '.smart-ecg-stage { position: relative; min-width: 0; overflow: hidden; background-color: #fff9f8; background-image: linear-gradient(rgba(230,73,73,.18) 1px, transparent 1px), linear-gradient(90deg, rgba(230,73,73,.18) 1px, transparent 1px), linear-gradient(rgba(210,48,48,.35) 2px, transparent 2px), linear-gradient(90deg, rgba(210,48,48,.35) 2px, transparent 2px); background-size: 8px 8px, 8px 8px, 40px 40px, 40px 40px; }',
      '.smart-ecg-svg { position: absolute; inset: 0; width: 100%; height: 100%; }',
      '.smart-ecg-grid-background { fill: #fff9f8; }',
      '.smart-ecg-grid-small { fill: none; stroke: rgba(230,73,73,.22); stroke-width: 1; }',
      '.smart-ecg-grid-large { fill: none; stroke: rgba(210,48,48,.42); stroke-width: 2; }',
      '.smart-ecg-line { fill: none; stroke: #24292f; stroke-width: 1.75; stroke-linecap: round; stroke-linejoin: round; }',
      '.smart-ecg-lead-label, .smart-ecg-paper-caption { fill: #0d45bf; font-size: 13px; font-weight: 800; }',
      '.smart-ecg-lead-marker, .smart-ecg-calibration { fill: none; stroke: #0d45bf; stroke-width: 3; stroke-linecap: square; stroke-linejoin: miter; }',
      '.smart-ecg-details { display: -ms-grid; display: grid; -ms-grid-rows: 2.75rem auto minmax(0, 1fr); grid-template-rows: 2.75rem auto minmax(0, 1fr); min-width: 0; background: #f7f8fa; }',
      '.smart-ecg-topbar { display: flex; align-items: center; min-width: 0; padding: 0 .5rem 0 1rem; color: #fff; background: #254f9f; }',
      '.smart-ecg-title { flex: 1 1 auto; min-width: 0; overflow: hidden; text-align: center; text-overflow: ellipsis; white-space: nowrap; font-size: .95rem; font-weight: 800; }',
      '.smart-ecg-actions { display: flex; gap: .2rem; }',
      '.smart-ecg-actions .smart-ecg-button { color: #fff; background: transparent; }',
      '.smart-ecg-actions .smart-ecg-button:hover { background: rgba(255,255,255,.14); border-color: rgba(255,255,255,.22); }',
      '.smart-ecg-command { color: #fff; border-color: rgba(255,255,255,.22); font-size: .76rem; font-weight: 800; }',
      '.smart-ecg-command.smart-ecg-sign { background: rgba(37, 111, 58, .9); }',
      '.smart-ecg-command.smart-ecg-save-action { background: rgba(255,255,255,.12); }',
      'body.smart-ecg-editing .smart-ecg-field-value, body.smart-ecg-editing .smart-ecg-cell-value, body.smart-ecg-editing .smart-ecg-interpretation { outline: 2px solid #88b7ff; background: #fff; }',
      '.smart-ecg-patient-grid { display: grid; grid-template-columns: repeat(9, minmax(0, 1fr)); gap: 0; padding: .75rem .65rem .55rem; background: #fff; border-bottom: 1px solid #d4d9e1; }',
      '.smart-ecg-field { min-width: 0; min-height: 2.35rem; padding: 0 .48rem; border-right: 1px solid #e0e4ea; }',
      '.smart-ecg-field:last-child { border-right: 0; }',
      '.smart-ecg-field.smart-ecg-span-2 { grid-column: span 2; }',
      '.smart-ecg-field-label { display: block; margin-bottom: .25rem; overflow: hidden; color: #818b98; text-overflow: ellipsis; white-space: nowrap; font-size: .74rem; font-weight: 800; }',
      '.smart-ecg-field-value { display: block; overflow-wrap: anywhere; color: #222a35; font-size: .78rem; font-weight: 800; }',
      '.smart-ecg-scroll { min-height: 0; overflow: auto; padding-bottom: .8rem; }',
      '.smart-ecg-section-title { display: flex; align-items: center; height: 1.38rem; padding: 0 .5rem; color: #1e2b38; background: #d6d9de; border-top: 1px solid #b5bcc7; border-bottom: 1px solid #b5bcc7; font-size: .82rem; font-weight: 800; }',
      '.smart-ecg-section-title svg { margin-right: .28rem; }',
      '.smart-ecg-interpretation-wrap { position: relative; }',
      '.smart-ecg-box { margin: .48rem .55rem; background: #fff; border: 1px solid #9da9b8; }',
      '.smart-ecg-data-grid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); }',
      '.smart-ecg-data-grid.smart-ecg-two { grid-template-columns: repeat(2, minmax(0, 1fr)); }',
      '.smart-ecg-data-grid.smart-ecg-one { grid-template-columns: 1fr; }',
      '.smart-ecg-cell { min-height: 2.85rem; padding: .55rem .5rem; border-right: 1px solid #e1e5eb; border-bottom: 1px solid #e1e5eb; }',
      '.smart-ecg-cell:last-child { border-right: 0; }',
      '.smart-ecg-cell-label { display: block; margin-bottom: .3rem; color: #8993a1; font-size: .76rem; font-weight: 800; }',
      '.smart-ecg-cell-value { display: block; overflow-wrap: anywhere; color: #202833; font-size: .8rem; font-weight: 800; }',
      '.smart-ecg-interpretation { padding: .75rem .78rem 1.2rem; font-size: .78rem; font-weight: 800; line-height: 1.45; white-space: pre-line; }',
      '.smart-ecg-suggestions { position: absolute; left: .55rem; right: .55rem; top: 2.25rem; z-index: 80; display: none; max-height: 13rem; overflow: auto; background: #fff; border: 1px solid #8da3c1; border-radius: 4px; box-shadow: 0 .45rem 1.25rem rgba(21,49,91,.22); }',
      '.smart-ecg-suggestions.is-open { display: block; }',
      '.smart-ecg-suggestion { display: block; width: 100%; padding: .52rem .65rem; color: #1f2d3d; background: #fff; border: 0; border-bottom: 1px solid #e4e8ee; text-align: left; font-size: .78rem; font-weight: 800; }',
      '.smart-ecg-suggestion:hover, .smart-ecg-suggestion:focus { background: #edf2f9; outline: none; }',
      '.smart-ecg-event-monitor { position: fixed; right: 1rem; bottom: 1.15rem; z-index: 50; min-width: 18rem; max-width: min(32rem, calc(100vw - 2rem)); padding: .65rem .8rem; color: #10213a; background: #fff; border: 1px solid #88b7ff; border-left: 5px solid #0d45bf; border-radius: 4px; box-shadow: 0 .35rem 1rem rgba(21,49,91,.18); font-size: .78rem; line-height: 1.35; }',
      '.smart-ecg-event-monitor strong { display: block; margin-bottom: .2rem; color: #0d45bf; font-size: .78rem; }',
      '.smart-ecg-event-monitor code { font-family: Menlo, Consolas, monospace; font-size: .74rem; }',
      '.study-match-app, .study-match-app * { box-sizing: border-box; }',
      '.study-match-app { display: grid; grid-template-columns: 13rem minmax(0, 1fr); height: 100vh; min-width: 60rem; color: #5f6873; background: #fff; font-size: .78rem; font-weight: 700; }',
      '.study-match-sidebar { display: flex; flex-direction: column; min-width: 0; padding: .9rem .9rem 1rem; background: #f3f4f6; border-right: 1px solid #cfd4da; }',
      '.study-match-sidebar h2 { margin: 0 0 .95rem; color: #1f2b37; font-size: .9rem; font-weight: 800; }',
      '.study-match-filter { min-height: 2.7rem; padding: .08rem .2rem .32rem .55rem; border-bottom: 1px solid #b8bec6; }',
      '.study-match-filter-label { display: block; color: #808995; font-size: .68rem; font-weight: 800; }',
      '.study-match-filter-value { display: flex; align-items: center; justify-content: space-between; gap: .35rem; margin-top: .15rem; color: #3a4652; font-size: .82rem; font-weight: 800; }',
      '.study-match-clear { color: #858d97; font-size: 1.1rem; line-height: 1; }',
      '.study-match-section-label { margin: 1rem 0 .8rem; color: #333d49; font-size: .78rem; font-weight: 800; }',
      '.study-match-date-field { display: flex; align-items: center; justify-content: space-between; height: 3.1rem; padding: 0 .25rem 0 .55rem; color: #8b939d; border-bottom: 1px solid #b8bec6; font-size: .84rem; }',
      '.study-match-side-button { width: 100%; height: 1.9rem; margin-top: .9rem; color: #fff; background: #005a9f; border: 0; border-radius: 3px; box-shadow: 0 1px 3px rgba(0,0,0,.25); font-size: .75rem; font-weight: 800; letter-spacing: .04em; }',
      '.study-match-side-button.secondary { margin-top: .45rem; color: #2d6394; background: #fff; border: 1px solid #d3d7dc; box-shadow: none; }',
      '.study-match-main { position: relative; min-width: 0; overflow: hidden; background: #fff; }',
      '.study-match-topbar { display: flex; align-items: center; justify-content: space-between; height: 3.3rem; padding: 0 .9rem; color: #e9f3ff; background: #00589d; }',
      '.study-match-result-count { display: flex; align-items: center; gap: .5rem; color: #eaf4ff; font-size: .95rem; font-weight: 800; }',
      '.study-match-refresh { display: inline-flex; align-items: center; justify-content: center; width: 1.15rem; height: 1.15rem; border: 2px solid rgba(255,255,255,.75); border-radius: 50%; font-size: .72rem; line-height: 1; }',
      '.study-match-toolbar { display: flex; align-items: center; gap: .65rem; color: #dceaf7; font-size: 1.05rem; font-weight: 800; }',
      '.study-match-table-wrap { overflow: auto; height: calc(100vh - 3.3rem); }',
      '.study-match-table { width: 100%; border-collapse: collapse; table-layout: fixed; }',
      '.study-match-table th { height: 2.75rem; padding: 0 .55rem; color: #687382; background: #fff; border-bottom: 1px solid #d9dde2; text-align: left; font-size: .74rem; font-weight: 800; white-space: nowrap; }',
      '.study-match-table td { height: 2.7rem; padding: .35rem .55rem; color: #67717d; border-bottom: 1px solid #eef0f3; vertical-align: middle; overflow: hidden; text-overflow: ellipsis; }',
      '.study-match-table tr:nth-child(odd) td { background: #eef0f3; }',
      '.study-match-table tr.is-selected td { background: #dbe9f6; }',
      '.study-match-check { width: .9rem; height: .9rem; border-radius: 3px; background: #d3d9e0; display: inline-block; }',
      '.study-match-status { display: inline-flex; align-items: center; justify-content: center; width: 1.55rem; height: 1.55rem; color: #25313d; background: #d5d9df; border-radius: 50%; font-size: .9rem; font-weight: 800; }',
      '.study-match-row-action { width: 1.7rem; height: 1.7rem; border: 0; color: #263542; background: transparent; font-size: 1.3rem; line-height: 1; }',
      '.study-match-menu { position: fixed; z-index: 70; width: 9.6rem; padding: .42rem 0; background: #fff; border-radius: 2px; box-shadow: 0 .45rem 1rem rgba(31,43,55,.28); }',
      '.study-match-menu[hidden] { display: none; }',
      '.study-match-menu button { display: block; width: 100%; min-height: 2.05rem; padding: 0 1rem; color: #4d5864; background: transparent; border: 0; text-align: left; font-size: .75rem; font-weight: 800; }',
      '.study-match-menu button:hover, .study-match-menu button:focus { background: #eef1f4; outline: none; }',
      '.study-match-overlay { position: fixed; inset: 0; z-index: 80; background: rgba(38, 42, 48, .34); }',
      '.study-match-overlay[hidden] { display: none; }',
      '.study-match-order-window { position: absolute; left: 5rem; right: 6rem; top: 9rem; min-height: 34rem; display: grid; grid-template-columns: 13.2rem minmax(0, 1fr); background: #fff; border-radius: 3px; box-shadow: 0 .2rem .8rem rgba(0,0,0,.18); overflow: hidden; }',
      '.study-match-order-summary { color: #fff; background: #005a9f; }',
      '.study-match-order-patient { padding: .45rem .6rem .35rem; text-align: center; font-size: .85rem; font-weight: 800; }',
      '.study-match-summary-grid { display: grid; grid-template-columns: 1fr 1fr; border-top: 1px solid rgba(255,255,255,.18); }',
      '.study-match-summary-cell { min-height: 2.25rem; padding: .35rem .42rem; border-right: 1px solid rgba(255,255,255,.18); border-bottom: 1px solid rgba(255,255,255,.18); }',
      '.study-match-summary-label { display: block; color: #b9d8f2; font-size: .6rem; }',
      '.study-match-summary-value { display: block; margin-top: .1rem; color: #fff; font-size: .64rem; line-height: 1.2; }',
      '.study-match-order-search { padding: .75rem .65rem; color: #4e5965; background: #f5f6f8; }',
      '.study-match-order-search h3 { margin: 0 0 .65rem; color: #2e3844; font-size: .82rem; font-weight: 800; }',
      '.study-match-order-input { display: flex; align-items: center; justify-content: space-between; height: 2.55rem; padding: 0 .25rem 0 .6rem; border-bottom: 1px solid #bfc5cc; }',
      '.study-match-radio { display: flex; align-items: center; gap: .4rem; height: 1.55rem; }',
      '.study-match-radio-dot { width: .85rem; height: .85rem; border-radius: 50%; border: 2px solid #b7bdc5; }',
      '.study-match-radio.is-selected .study-match-radio-dot { border: 4px solid #0b86e8; }',
      '.study-match-find { float: right; min-width: 3.4rem; height: 1.9rem; margin-top: .8rem; color: #fff; background: #005a9f; border: 0; border-radius: 3px; box-shadow: 0 1px 3px rgba(0,0,0,.25); font-size: .72rem; font-weight: 800; }',
      '.study-match-order-list { min-width: 0; padding: .6rem 1.4rem 1rem; background: #fff; }',
      '.study-match-close { position: absolute; top: .4rem; right: .55rem; width: 1.8rem; height: 1.8rem; border: 0; color: #343d47; background: transparent; font-size: 1.5rem; line-height: 1; }',
      '.study-match-order-table { width: 100%; border-collapse: collapse; table-layout: fixed; }',
      '.study-match-order-table th { height: 2.5rem; color: #687382; text-align: left; font-size: .74rem; font-weight: 800; }',
      '.study-match-order-table td { height: 2.65rem; padding: .25rem .4rem; color: #65707d; overflow: hidden; text-overflow: ellipsis; vertical-align: middle; }',
      '.study-match-order-table tr:nth-child(odd) td { background: #eef0f3; }',
      '.study-match-select-order { min-width: 4.6rem; height: 1.55rem; color: #fff; background: #005a9f; border: 0; border-radius: 3px; box-shadow: 0 1px 3px rgba(0,0,0,.25); font-size: .72rem; font-weight: 800; }',
      '.study-match-reconcile-card { position: absolute; left: 50%; top: 29%; transform: translate(-50%, -50%); width: 35.6rem; background: #fff; border-radius: 4px; box-shadow: 0 .2rem .8rem rgba(0,0,0,.2); overflow: hidden; }',
      '.study-match-compare { width: 100%; border-collapse: collapse; table-layout: fixed; }',
      '.study-match-compare th, .study-match-compare td { height: 3.6rem; padding: .45rem .8rem; border-bottom: 1px solid #e2e5e8; text-align: center; }',
      '.study-match-compare th { color: #26313d; font-size: .78rem; font-weight: 800; }',
      '.study-match-compare-label { color: #29333f; font-weight: 800; }',
      '.study-match-compare-value { background: #f2f3f5; color: #4a5562; }',
      '.study-match-dialog-actions { display: flex; align-items: center; justify-content: flex-end; gap: .8rem; height: 3.7rem; padding: 0 .7rem; }',
      '.study-match-dialog-actions button { height: 1.9rem; border: 0; border-radius: 3px; font-size: .72rem; font-weight: 800; letter-spacing: .04em; }',
      '.study-match-cancel { color: #005a9f; background: transparent; }',
      '.study-match-promote { min-width: 8.2rem; color: #fff; background: #005a9f; box-shadow: 0 1px 3px rgba(0,0,0,.25); }',
      '@media print { .smart-ecg-event-monitor { display: none !important; } .smart-ecg-stage, .smart-ecg-svg { -webkit-print-color-adjust: exact; print-color-adjust: exact; } body.smart-ecg-body { overflow: visible; background: #fff; } }',
      '@media (max-width: 1100px) { body.smart-ecg-body { overflow: auto; } .smart-ecg-app { grid-template-columns: 1fr; height: auto; min-height: 100vh; } .smart-ecg-viewer { min-height: 680px; border-right: 0; border-bottom: 1px solid #9aa5b4; } .smart-ecg-details { grid-template-rows: 2.75rem auto auto; } }',
      '@media (max-width: 720px) { .smart-ecg-metrics { overflow-x: auto; } .smart-ecg-viewer { grid-template-rows: 3rem 2.25rem 560px; min-height: 0; } .smart-ecg-patient-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } .smart-ecg-field.smart-ecg-span-2 { grid-column: span 1; } .smart-ecg-data-grid, .smart-ecg-data-grid.smart-ecg-two { grid-template-columns: repeat(2, minmax(0, 1fr)); } .smart-ecg-data-grid.smart-ecg-one { grid-template-columns: 1fr; } }'
    ].join('\n');
  }

  function installStyles() {
    if (document.getElementById(STYLE_ID)) {
      return;
    }

    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.type = 'text/css';
    if (style.styleSheet) {
      style.styleSheet.cssText = cssText();
    } else {
      style.appendChild(document.createTextNode(cssText()));
    }
    document.head.appendChild(style);
  }

  function icon(name) {
    var icons = {
      up: '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 16l6-8 6 8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path><path d="M6 21l6-8 6 8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path></svg>',
      measure: '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h10M7 21h10M12 4v16M9 8h6M9 16h6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"></path></svg>',
      wave: '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 15h3l2-6 3 10 2-8 2 4h6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path><path d="M4 20h16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-dasharray="1 4"></path></svg>',
      filter: '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16l-6 7v6l-4 2v-8z" fill="currentColor"></path></svg>',
      fullscreen: '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"></path></svg>',
      link: '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.54.54l2-2a5 5 0 0 0-7.07-7.07l-1.15 1.15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-2 2a5 5 0 0 0 7.07 7.07l1.15-1.15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"></path></svg>',
      print: '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 8V3h10v5M7 17H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2M7 14h10v7H7z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"></path></svg>',
      edit: '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4zM13 7l4 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"></path></svg>',
      sign: '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6L9 17l-5-5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"></path><path d="M4 21h16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"></path></svg>',
      menu: '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"></path></svg>',
      down: '<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M2 4l4 4 4-4z" fill="currentColor"></path></svg>',
      save: '<svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3h11l3 3v15H5z" fill="currentColor"></path><path d="M8 3v6h8V3M8 18h8v3H8z" fill="#f7fbff"></path></svg>'
    };

    return icons[name] || '';
  }

  function metric(label, id, value, extraClass) {
    return [
      '<div class="smart-ecg-metric ', extraClass || '', '">',
      '<span class="smart-ecg-metric-label">', label, '</span>',
      '<span class="smart-ecg-metric-value" id="', id, '">', value, '</span>',
      '</div>'
    ].join('');
  }

  function field(label, id, extraClass) {
    return [
      '<div class="smart-ecg-field ', extraClass || '', '">',
      '<span class="smart-ecg-field-label">', label, '</span>',
      '<span class="smart-ecg-field-value" id="', id, '">--</span>',
      '</div>'
    ].join('');
  }

  function dataCell(label, id) {
    return [
      '<div class="smart-ecg-cell">',
      '<span class="smart-ecg-cell-label">', label, '</span>',
      '<span class="smart-ecg-cell-value" id="', id, '">--</span>',
      '</div>'
    ].join('');
  }

  function sectionTitle(text) {
    return '<div class="smart-ecg-section-title">' + icon('down') + text + '</div>';
  }

  function shellHtml() {
    return [
      '<div class="smart-ecg-app">',
      '<section class="smart-ecg-viewer" aria-label="ECG waveform viewer">',
      '<div class="smart-ecg-metrics" aria-label="ECG measurements">',
      metric('Rate', 'ecg-rate', '93'),
      metric('PR', 'ecg-pr', '112'),
      metric('QRSd', 'ecg-qrsd', '84'),
      metric('QT', 'ecg-qt', '336'),
      metric('QTc', 'ecg-qtc', '418'),
      metric('P', 'ecg-p-axis', '13'),
      metric('QRS', 'ecg-qrs-axis', '41'),
      metric('T', 'ecg-t-axis', '6'),
      metric('Severity', 'ecg-severity', 'Abnormal ECG', 'smart-ecg-severity'),
      '</div>',
      '<div class="smart-ecg-toolbar" aria-label="ECG toolbar">',
      '<button class="smart-ecg-button" type="button" title="Previous tracing" aria-label="Previous tracing">', icon('up'), '</button>',
      '<button class="smart-ecg-button" type="button" title="Measure" aria-label="Measure">', icon('measure'), '</button>',
      '<button class="smart-ecg-button" type="button" title="Wave tools" aria-label="Wave tools">', icon('wave'), '</button>',
      '<button class="smart-ecg-button" type="button" title="Filter" aria-label="Filter">', icon('filter'), '</button>',
      '<button class="smart-ecg-button" type="button" title="Full screen" aria-label="Full screen">', icon('fullscreen'), '</button>',
      '<div class="smart-ecg-toolbar-spacer"></div>',
      '<span class="smart-ecg-scale">10mm/mV</span>',
      '<button class="smart-ecg-button smart-ecg-close-button" id="smart-ecg-close" type="button" title="Close viewer" aria-label="Close viewer">X</button>',
      '</div>',
      '<div class="smart-ecg-stage">',
      '<svg id="smart-ecg-chart" class="smart-ecg-svg" viewBox="0 0 1200 680" preserveAspectRatio="none" role="img" aria-label="Twelve lead ECG waveform"></svg>',
      '</div>',
      '</section>',
      '<aside class="smart-ecg-details" aria-label="ECG details">',
      '<div class="smart-ecg-topbar">',
      '<div class="smart-ecg-title" id="ecg-source-status" aria-live="polite"></div>',
      '<div class="smart-ecg-actions">',
      '<button class="smart-ecg-button" type="button" title="Copy link" aria-label="Copy link">', icon('link'), '</button>',
      '<button class="smart-ecg-button" id="smart-ecg-print" type="button" title="Print" aria-label="Print">', icon('print'), '</button>',
      '<button class="smart-ecg-button" id="smart-ecg-edit" type="button" title="Edit interpretation" aria-label="Edit interpretation">', icon('edit'), '</button>',
      '<button class="smart-ecg-button smart-ecg-command smart-ecg-save-action" id="smart-ecg-save" type="button" title="Save ECG" aria-label="Save ECG">', icon('save'), '</button>',
      '<button class="smart-ecg-button smart-ecg-command smart-ecg-sign" id="smart-ecg-sign" type="button" title="Sign ECG" aria-label="Sign ECG">', icon('sign'), '</button>',
      '<button class="smart-ecg-button" type="button" title="Menu" aria-label="Menu">', icon('menu'), '</button>',
      '</div>',
      '</div>',
      '<div class="smart-ecg-patient-grid">',
      field('Last Name', 'ecg-last-name'),
      field('First Name', 'ecg-first-name'),
      field('Pat ID', 'ecg-patient-id'),
      field('Age', 'ecg-age'),
      field('DOB', 'ecg-dob'),
      field('Date-Time Performed', 'ecg-performed-at', 'smart-ecg-span-2'),
      field('Gender', 'ecg-gender'),
      field('Race', 'ecg-race'),
      '</div>',
      '<div class="smart-ecg-scroll">',
      sectionTitle('Visit'),
      '<div class="smart-ecg-box"><div class="smart-ecg-data-grid">',
      dataCell('Account #', 'ecg-account-number'),
      dataCell('Height', 'ecg-height'),
      dataCell('Weight', 'ecg-weight'),
      dataCell('RX', 'ecg-rx'),
      dataCell('Tech', 'ecg-tech'),
      dataCell('Site', 'ecg-site'),
      dataCell('Location', 'ecg-location'),
      dataCell('Dept', 'ecg-dept'),
      dataCell('Room', 'ecg-room'),
      dataCell('DX', 'ecg-dx'),
      '</div></div>',
      '<div class="smart-ecg-box"><div class="smart-ecg-data-grid smart-ecg-two">',
      dataCell('Reading Provider', 'ecg-reading-provider'),
      dataCell('Fellow', 'ecg-fellow'),
      '</div></div>',
      '<div class="smart-ecg-box"><div class="smart-ecg-data-grid smart-ecg-one">',
      dataCell('Accession', 'ecg-accession'),
      '</div></div>',
      sectionTitle('Interpretation'),
      '<div class="smart-ecg-interpretation-wrap">',
      '<div class="smart-ecg-interpretation" id="ecg-interpretation"></div>',
      '<div class="smart-ecg-suggestions" id="smart-ecg-suggestions" role="listbox" aria-label="ECG interpretation suggestions"></div>',
      '</div>',
      '</div>',
      '</aside>',
      '</div>',
      '<div class="smart-ecg-event-monitor" id="smart-ecg-event-monitor" aria-live="polite">',
      '<strong>Event monitor</strong>',
      '<span>Waiting for Save, Sign, Edit, or Close action.</span>',
      '</div>'
    ].join('');
  }

  function studyMatchSidebarHtml(context) {
    return [
      '<aside class="study-match-sidebar" aria-label="Inbox settings">',
      '<h2>Inbox Settings</h2>',
      '<div class="study-match-filter"><span class="study-match-filter-label">Status</span><span class="study-match-filter-value">Preliminary<span>v</span></span></div>',
      '<div class="study-match-filter"><span class="study-match-filter-label">Site</span><span class="study-match-filter-value">Baseline West Medic...<span>v</span></span></div>',
      '<div class="study-match-filter"><span class="study-match-filter-label">Type</span><span class="study-match-filter-value">ECG<span>v</span></span></div>',
      '<div class="study-match-filter"><span class="study-match-filter-label">Search By</span><span class="study-match-filter-value">Pat ID<span>v</span></span></div>',
      '<div class="study-match-filter"><span class="study-match-filter-label">Search</span><span class="study-match-filter-value">', escapeHtml(context.patientId), '<span class="study-match-clear">x</span></span></div>',
      '<div class="study-match-section-label">Date Performed</div>',
      '<div class="study-match-date-field"><span>Start Date</span><span>[]</span></div>',
      '<div class="study-match-date-field"><span>End Date</span><span>[]</span></div>',
      '<button class="study-match-side-button" type="button">SEARCH</button>',
      '<button class="study-match-side-button secondary" type="button">SAVE DEFAULTS</button>',
      '</aside>'
    ].join('');
  }

  function studyMatchRowsHtml(studies) {
    return studies.map(function(study, index) {
      return [
        '<tr class="study-match-result-row ', index === 0 ? 'is-selected' : '', '" data-study-index="', index, '">',
        '<td><span class="study-match-check" aria-hidden="true"></span></td>',
        '<td><span class="study-match-status">', escapeHtml(study.status), '</span></td>',
        '<td>', escapeHtml(study.datePerformed), '</td>',
        '<td>', escapeHtml(study.patientName), '</td>',
        '<td>', escapeHtml(study.patientId), '</td>',
        '<td>', escapeHtml(study.dob), '</td>',
        '<td title="', escapeHtml(study.site), '">', escapeHtml(study.site), '</td>',
        '<td>', escapeHtml(study.readingProvider), '</td>',
        '<td>', escapeHtml(study.referringMd), '</td>',
        '<td>', escapeHtml(study.type), '</td>',
        '<td>', escapeHtml(study.location), '</td>',
        '<td><button class="study-match-row-action" type="button" data-study-action="menu" data-study-index="', index, '" aria-label="Study actions">...</button></td>',
        '</tr>'
      ].join('');
    }).join('');
  }

  function studyMatchInboxHtml(context) {
    return [
      '<div class="study-match-app" id="study-match-app">',
      studyMatchSidebarHtml(context),
      '<main class="study-match-main" aria-label="Unmatched studies">',
      '<div class="study-match-topbar">',
      '<div class="study-match-result-count"><span class="study-match-refresh">C</span><span>', context.studies.length, ' Results</span></div>',
      '<div class="study-match-toolbar"><span>|||</span><span>O</span><span>[]</span><span>=</span></div>',
      '</div>',
      '<div class="study-match-table-wrap">',
      '<table class="study-match-table">',
      '<colgroup>',
      '<col style="width:2.2rem"><col style="width:4rem"><col style="width:10rem"><col style="width:10rem"><col style="width:6rem"><col style="width:7rem">',
      '<col style="width:7rem"><col style="width:9rem"><col style="width:9rem"><col style="width:5rem"><col style="width:9rem"><col style="width:3rem">',
      '</colgroup>',
      '<thead><tr>',
      '<th></th><th>Status</th><th>Date Performed ^</th><th>Patient Name</th><th>Pat ID</th><th>DOB</th>',
      '<th>Site</th><th>Reading Provider</th><th>Referring MD</th><th>Type</th><th>Location</th><th></th>',
      '</tr></thead>',
      '<tbody>', studyMatchRowsHtml(context.studies), '</tbody>',
      '</table>',
      '</div>',
      '<div class="study-match-menu" id="study-match-menu" hidden>',
      '<button type="button" data-menu-action="noop">Print</button>',
      '<button type="button" data-menu-action="noop">Print Cover</button>',
      '<button type="button" data-menu-action="noop">Trash</button>',
      '<button type="button" data-menu-action="noop">Assign to Site</button>',
      '<button type="button" data-menu-action="noop">Assign to Reading MD</button>',
      '<button type="button" data-menu-action="reconcile-by-id">Reconcile by ID</button>',
      '<button type="button" data-menu-action="noop">Reconcile by Name</button>',
      '<button type="button" data-menu-action="noop">Edit Note</button>',
      '<button type="button" data-menu-action="noop">Stat</button>',
      '</div>',
      '<div class="study-match-overlay" id="study-match-order-overlay" hidden></div>',
      '<div class="study-match-overlay" id="study-match-reconcile-overlay" hidden></div>',
      '</main>',
      '</div>'
    ].join('');
  }

  function studySummaryHtml(study, patient) {
    var performedParts = study.datePerformed.split(/\s+/);
    var performedDate = performedParts[0] || study.datePerformed;
    var performedTime = performedParts.slice(1).join(' ');

    return [
      '<div class="study-match-order-summary">',
      '<div class="study-match-order-patient">', escapeHtml(patientDisplayName(patient)), '<br>', escapeHtml(patient.patientId), '</div>',
      '<div class="study-match-summary-grid">',
      '<div class="study-match-summary-cell"><span class="study-match-summary-label">Date Performed</span><span class="study-match-summary-value">', escapeHtml(performedDate), '<br>', escapeHtml(performedTime), '</span></div>',
      '<div class="study-match-summary-cell"><span class="study-match-summary-label">Site</span><span class="study-match-summary-value">', escapeHtml(study.site), '</span></div>',
      '<div class="study-match-summary-cell"><span class="study-match-summary-label">DOB</span><span class="study-match-summary-value">', escapeHtml(study.dob), '</span></div>',
      '<div class="study-match-summary-cell"><span class="study-match-summary-label">Location</span><span class="study-match-summary-value">', escapeHtml(study.location), '</span></div>',
      '</div>',
      '</div>'
    ].join('');
  }

  function studyMatchOrderRowsHtml(orders) {
    return orders.map(function(order, index) {
      return [
        '<tr>',
        '<td>', escapeHtml(order.patientName), '</td>',
        '<td>', escapeHtml(order.patientId), '</td>',
        '<td>', escapeHtml(order.dob), '</td>',
        '<td>', escapeHtml(order.date), '</td>',
        '<td>', escapeHtml(order.status), '</td>',
        '<td>', escapeHtml(order.orderNumber), '</td>',
        '<td>', escapeHtml(order.modality), '</td>',
        '<td>', escapeHtml(order.site), '</td>',
        '<td><button class="study-match-select-order" type="button" data-order-index="', index, '">SELECT</button></td>',
        '</tr>'
      ].join('');
    }).join('');
  }

  function studyMatchOrderOverlayHtml(context, studyIndex) {
    var study = context.studies[studyIndex] || context.studies[0];
    return [
      '<div class="study-match-order-window">',
      '<aside>',
      studySummaryHtml(study, context.patient),
      '<div class="study-match-order-search">',
      '<h3>Order Search</h3>',
      '<div class="study-match-order-input"><span><small>Patient ID</small><br>', escapeHtml(context.patientId), '</span><span>x</span></div>',
      '<div class="study-match-radio is-selected"><span class="study-match-radio-dot"></span><span>Patient ID</span></div>',
      '<div class="study-match-radio"><span class="study-match-radio-dot"></span><span>Last Name</span></div>',
      '<div class="study-match-order-input"><span>Order Date</span><span>[]</span></div>',
      '<div class="study-match-order-input"><span>Order Number</span><span>x</span></div>',
      '<div class="study-match-order-input"><span><small>Order Status</small><br>Open</span><span>v</span></div>',
      '<div class="study-match-order-input"><span><small>Site</small><br>All</span><span>v</span></div>',
      '<button class="study-match-find" type="button">FIND</button>',
      '</div>',
      '</aside>',
      '<section class="study-match-order-list">',
      '<button class="study-match-close" type="button" data-dialog-action="close-order" aria-label="Close order search">x</button>',
      '<table class="study-match-order-table">',
      '<thead><tr><th>Patient Name</th><th>Patient ID</th><th>DOB</th><th>Date</th><th>Status</th><th>Order #</th><th>Modality</th><th>Site</th><th></th></tr></thead>',
      '<tbody>', studyMatchOrderRowsHtml(context.orders), '</tbody>',
      '</table>',
      '</section>',
      '</div>'
    ].join('');
  }

  function studyMatchReconcileOverlayHtml(context, studyIndex, orderIndex) {
    var study = context.studies[studyIndex] || context.studies[0];
    var order = context.orders[orderIndex] || context.orders[0];
    var patient = context.patient;

    return [
      '<div class="study-match-reconcile-card">',
      '<table class="study-match-compare">',
      '<thead><tr><th></th><th>Study</th><th></th><th>Order #', escapeHtml(order.orderNumber), '</th></tr></thead>',
      '<tbody>',
      '<tr><td class="study-match-compare-label">Last Name</td><td class="study-match-compare-value">', escapeHtml(patient.lname), '</td><td></td><td class="study-match-compare-value">', escapeHtml(patient.lname), '</td></tr>',
      '<tr><td class="study-match-compare-label">First Name</td><td class="study-match-compare-value">', escapeHtml(patient.fname), '</td><td></td><td class="study-match-compare-value">', escapeHtml(patient.fname), '</td></tr>',
      '<tr><td class="study-match-compare-label">Patient ID</td><td class="study-match-compare-value">', escapeHtml(patient.patientId), '</td><td></td><td class="study-match-compare-value">', escapeHtml(order.patientId), '</td></tr>',
      '<tr><td class="study-match-compare-label">Date</td><td class="study-match-compare-value">', escapeHtml(study.datePerformed.split(' ')[0]), '</td><td></td><td class="study-match-compare-value">', escapeHtml(order.date.split(' ')[0]), '</td></tr>',
      '</tbody>',
      '</table>',
      '<div class="study-match-dialog-actions">',
      '<button class="study-match-cancel" type="button" data-dialog-action="cancel-reconcile">CANCEL</button>',
      '<button class="study-match-promote" type="button" data-dialog-action="save-promote" data-order-index="', orderIndex, '">SAVE &amp; PROMOTE</button>',
      '</div>',
      '</div>'
    ].join('');
  }

  function byId(id) {
    return document.getElementById(id);
  }

  function setText(id, value) {
    var node = byId(id);
    if (node) {
      node.textContent = value || '--';
    }
  }

  function calculateAge(birthDate) {
    if (!birthDate) {
      return '--';
    }

    var dob = new Date(birthDate + 'T00:00:00');
    if (isNaN(dob.getTime())) {
      return '--';
    }

    var today = new Date();
    var age = today.getFullYear() - dob.getFullYear();
    var monthDelta = today.getMonth() - dob.getMonth();
    if (monthDelta < 0 || (monthDelta === 0 && today.getDate() < dob.getDate())) {
      age -= 1;
    }

    return age + ' yrs';
  }

  function pad(value) {
    return String(value).length < 2 ? '0' + value : String(value);
  }

  function formatDate(value) {
    if (!value) {
      return '--';
    }

    var date = value instanceof Date ? value : new Date(value + 'T00:00:00');
    if (isNaN(date.getTime())) {
      return value;
    }

    return [
      date.getMonth() + 1,
      date.getDate(),
      date.getFullYear()
    ].join('/');
  }

  function formatDateTime(value) {
    var date = value instanceof Date ? value : new Date(value);
    if (isNaN(date.getTime())) {
      date = new Date();
    }

    return [
      date.getMonth() + 1,
      date.getDate(),
      date.getFullYear()
    ].join('/') + ' ' + [
      pad(date.getHours()),
      pad(date.getMinutes()),
      pad(date.getSeconds())
    ].join(':');
  }

  function renderPatient(data) {
    setCurrentStudyId(data.accession || getStudyId() || data.patientId);
    setSourceStatus(data.sourceStatus);
    setText('ecg-first-name', data.fname);
    setText('ecg-last-name', data.lname);
    setText('ecg-patient-id', data.patientId);
    setText('ecg-age', calculateAge(data.birthdate));
    setText('ecg-dob', formatDate(data.birthdate));
    setText('ecg-performed-at', formatDateTime(data.performedAt));
    setText('ecg-gender', data.gender);
    setText('ecg-race', data.race);
    setText('ecg-account-number', data.accountNumber);
    setText('ecg-height', data.height);
    setText('ecg-weight', data.weight);
    setText('ecg-rx', 'LDL ' + (data.ldl || '--'));
    setText('ecg-tech', 'HDL ' + (data.hdl || '--'));
    setText('ecg-site', 'Cardiovascular');
    setText('ecg-location', 'SMART App');
    setText('ecg-dept', 'FHIR');
    setText('ecg-room', 'ECG');
    setText('ecg-dx', 'BP ' + (data.systolicbp || '--') + '/' + (data.diastolicbp || '--'));
    setText('ecg-reading-provider', 'card doctor');
    setText('ecg-fellow', '--');
    setText('ecg-accession', data.accession);
    setText('ecg-interpretation', data.interpretation);
  }

  function addSvg(tag, attrs) {
    var el = document.createElementNS(SVG_NS, tag);
    var key;

    for (key in attrs) {
      if (Object.prototype.hasOwnProperty.call(attrs, key)) {
        el.setAttribute(key, attrs[key]);
      }
    }

    return el;
  }

  function gaussian(x, mean, width) {
    var z = (x - mean) / width;
    return Math.exp(-0.5 * z * z);
  }

  function waveformAt(phase, lead) {
    return (
      lead.p * gaussian(phase, 0.18, 0.035) +
      lead.q * gaussian(phase, 0.37, 0.012) +
      lead.r * gaussian(phase, 0.405, 0.009) +
      lead.s * gaussian(phase, 0.435, 0.014) +
      lead.t * gaussian(phase, 0.72, 0.075)
    ) * lead.gain;
  }

  function makeTracePath(startX, endX, baseY, lead, beatPx, scale) {
    var d = '';
    var offset = (lead.seed * 11) % beatPx;
    var x;
    var beatPosition;
    var phase;
    var drift;
    var fineNoise;
    var y;

    for (x = startX; x <= endX; x += 1.75) {
      beatPosition = (x - startX + offset) % beatPx;
      phase = beatPosition / beatPx;
      drift = Math.sin((x + lead.seed * 17) * 0.031) * 1.25;
      fineNoise = Math.sin((x + lead.seed * 23) * 0.47) * 0.42;
      y = baseY - waveformAt(phase, lead) * scale + drift + fineNoise;
      d += (x === startX ? 'M' : 'L') + x.toFixed(1) + ' ' + y.toFixed(1) + ' ';
    }

    return d;
  }

  function drawLead(svg, lead) {
    var rowBases = [96, 248, 400, 552];
    var startX = 16 + lead.col * 292;
    var endX = startX + 266;
    var baseY = rowBases[lead.row];
    var labelX = lead.col === 0 ? startX - 6 : startX + 10;
    var markerX = startX - 5;
    var marker;
    var label;

    if (lead.col !== 0) {
      marker = addSvg('path', {
        'class': 'smart-ecg-lead-marker',
        d: 'M' + markerX + ' ' + (baseY - 42) + 'V' + (baseY - 12) +
          'M' + markerX + ' ' + (baseY + 12) + 'V' + (baseY + 42)
      });
      svg.appendChild(marker);
    }

    label = addSvg('text', {
      'class': 'smart-ecg-lead-label',
      x: labelX,
      y: baseY - 38
    });
    label.appendChild(document.createTextNode(lead.name));
    svg.appendChild(label);

    svg.appendChild(addSvg('path', {
      'class': 'smart-ecg-line',
      d: makeTracePath(startX, endX, baseY, lead, 74, 36)
    }));
  }

  function drawCalibration(svg, y) {
    svg.appendChild(addSvg('path', {
      'class': 'smart-ecg-calibration',
      d: 'M1164 ' + y + 'V' + (y - 42) + 'H1186V' + y
    }));
  }

  function drawCaption(svg, x, y, value) {
    var text = addSvg('text', {
      'class': 'smart-ecg-paper-caption',
      x: x,
      y: y
    });
    text.appendChild(document.createTextNode(value));
    svg.appendChild(text);
  }

  function drawEcgPaperGrid(svg) {
    var smallPath = '';
    var largePath = '';
    var x;
    var y;

    svg.appendChild(addSvg('rect', {
      'class': 'smart-ecg-grid-background',
      x: 0,
      y: 0,
      width: WIDTH,
      height: HEIGHT
    }));

    for (x = 0; x <= WIDTH; x += 8) {
      smallPath += 'M' + x + ' 0V' + HEIGHT + ' ';
    }

    for (y = 0; y <= HEIGHT; y += 8) {
      smallPath += 'M0 ' + y + 'H' + WIDTH + ' ';
    }

    for (x = 0; x <= WIDTH; x += 40) {
      largePath += 'M' + x + ' 0V' + HEIGHT + ' ';
    }

    for (y = 0; y <= HEIGHT; y += 40) {
      largePath += 'M0 ' + y + 'H' + WIDTH + ' ';
    }

    svg.appendChild(addSvg('path', {
      'class': 'smart-ecg-grid-small',
      d: smallPath
    }));

    svg.appendChild(addSvg('path', {
      'class': 'smart-ecg-grid-large',
      d: largePath
    }));
  }

  function drawEcgChart() {
    var svg = byId('smart-ecg-chart');
    var rhythmLabel;
    var i;

    if (!svg) {
      return;
    }

    while (svg.firstChild) {
      svg.removeChild(svg.firstChild);
    }

    svg.setAttribute('viewBox', '0 0 ' + WIDTH + ' ' + HEIGHT);
    drawEcgPaperGrid(svg);

    for (i = 0; i < LEADS.length; i += 1) {
      drawLead(svg, LEADS[i]);
    }

    rhythmLabel = addSvg('text', {
      'class': 'smart-ecg-lead-label',
      x: 10,
      y: 514
    });
    rhythmLabel.appendChild(document.createTextNode('II'));
    svg.appendChild(rhythmLabel);

    svg.appendChild(addSvg('path', {
      'class': 'smart-ecg-line',
      d: makeTracePath(16, 1160, 552, RHYTHM, 74, 36)
    }));

    drawCalibration(svg, 96);
    drawCalibration(svg, 248);
    drawCalibration(svg, 400);
    drawCalibration(svg, 552);
    drawCaption(svg, 8, 666, '25mm/sec');
    drawCaption(svg, 1092, 666, '60 - 0.05 - 150 Hz');
  }

  function getUiText(id) {
    var node = byId(id);
    return node ? node.textContent : '';
  }

  function setSourceStatus(value) {
    var node = byId('ecg-source-status');
    if (node) {
      node.textContent = value === 'Demo ECG' ? '' : (value || '');
    }
  }

  function escapeHtml(value) {
    return String(value === undefined || value === null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function updateEventMonitor(action, studyId, data) {
    var monitor = byId('smart-ecg-event-monitor');
    var now = new Date();

    if (!monitor) {
      return;
    }

    monitor.innerHTML = [
      '<strong>Event triggered</strong>',
      '<div>Action: <code>', escapeHtml(action), '</code></div>',
      '<div>Study ID: <code>', escapeHtml(studyId || 'UNKNOWN_STUDY'), '</code></div>',
      '<div>Data: <code>', escapeHtml(String(data)), '</code></div>',
      '<div>Time: <code>',
      pad(now.getHours()), ':', pad(now.getMinutes()), ':', pad(now.getSeconds()),
      '</code></div>'
    ].join('');
  }

  function bodyHasClass(className) {
    return (' ' + document.body.className + ' ').indexOf(' ' + className + ' ') > -1;
  }

  function addBodyClass(className) {
    if (!bodyHasClass(className)) {
      document.body.className = (document.body.className + ' ' + className).replace(/\s+/g, ' ');
    }
  }

  function removeBodyClass(className) {
    document.body.className = (' ' + document.body.className + ' ')
      .replace(' ' + className + ' ', ' ')
      .replace(/\s+/g, ' ');
  }

  function setEditMode(enabled) {
    var editableNodes = getEditableDetailNodes();
    var editButton = byId('smart-ecg-edit');
    var i;

    logTroubleshooting('edit mode changed', {
      enabled: enabled,
      editableFieldCount: editableNodes.length
    });

    for (i = 0; i < editableNodes.length; i += 1) {
      editableNodes[i].contentEditable = enabled ? 'true' : 'false';
      editableNodes[i].setAttribute('aria-readonly', enabled ? 'false' : 'true');
      if (enabled && i === 0 && typeof editableNodes[i].focus === 'function') {
        editableNodes[i].focus();
      }
    }

    if (enabled) {
      addBodyClass('smart-ecg-editing');
      setSourceStatus('Editing');
    } else {
      removeBodyClass('smart-ecg-editing');
    }

    if (editButton) {
      editButton.setAttribute('aria-pressed', enabled ? 'true' : 'false');
      editButton.title = enabled ? 'Stop editing' : 'Edit interpretation';
    }

    if (!enabled) {
      hideInterpretationSuggestions();
    }
  }

  function getEditableDetailNodes() {
    if (!document.querySelectorAll) {
      return [];
    }

    return document.querySelectorAll(
      '.smart-ecg-details .smart-ecg-field-value, ' +
      '.smart-ecg-details .smart-ecg-cell-value, ' +
      '.smart-ecg-details .smart-ecg-interpretation'
    );
  }

  function markPendingData() {
    if (dirtyDataSent) {
      logTroubleshooting('pending data already marked; duplicate dirty event suppressed', {
        studyId: getCurrentStudyId()
      });
      return;
    }

    dirtyDataSent = true;
    logTroubleshooting('right-side ECG details changed; marking pending data', {
      studyId: getCurrentStudyId()
    });
    setSourceStatus('Pending data');
    sendCardiologyViewerEvent('PENDING_DATA', true);
  }

  function getCurrentInterpretationToken() {
    var interpretation = byId('ecg-interpretation');
    var text;
    var lines;

    if (!interpretation) {
      return '';
    }

    text = interpretation.textContent || '';
    lines = text.split(/\n/);
    return (lines[lines.length - 1] || '').replace(/^\s+|\s+$/g, '');
  }

  function showInterpretationSuggestions() {
    var suggestions = byId('smart-ecg-suggestions');
    var token = getCurrentInterpretationToken().toUpperCase();
    var matches = [];
    var i;

    if (!suggestions || !bodyHasClass('smart-ecg-editing')) {
      return;
    }

    for (i = 0; i < ECG_INTERPRETATION_SUGGESTIONS.length; i += 1) {
      if (!token || ECG_INTERPRETATION_SUGGESTIONS[i].indexOf(token) > -1) {
        matches.push(ECG_INTERPRETATION_SUGGESTIONS[i]);
      }
      if (matches.length === 6) {
        break;
      }
    }

    if (!matches.length) {
      hideInterpretationSuggestions();
      return;
    }

    suggestions.innerHTML = matches.map(function(value) {
      return '<button class="smart-ecg-suggestion" type="button" data-suggestion="' +
        escapeHtml(value) + '">' + escapeHtml(value) + '</button>';
    }).join('');
    suggestions.className = 'smart-ecg-suggestions is-open';
  }

  function hideInterpretationSuggestions() {
    var suggestions = byId('smart-ecg-suggestions');
    if (suggestions) {
      suggestions.className = 'smart-ecg-suggestions';
    }
  }

  function insertInterpretationSuggestion(value) {
    var interpretation = byId('ecg-interpretation');
    var text;
    var lines;

    if (!interpretation || !value) {
      return;
    }

    text = interpretation.textContent || '';
    lines = text.split(/\n/);
    lines[lines.length - 1] = value;
    interpretation.textContent = lines.join('\n') + '\n';
    hideInterpretationSuggestions();
    markPendingData();
    if (typeof interpretation.focus === 'function') {
      interpretation.focus();
    }
  }

  function clearPendingData() {
    if (!dirtyDataSent) {
      logTroubleshooting('pending data clear skipped; no dirty state is active', {
        studyId: getCurrentStudyId()
      });
      return;
    }

    dirtyDataSent = false;
    logTroubleshooting('clearing pending data', {
      studyId: getCurrentStudyId()
    });
    sendCardiologyViewerEvent('PENDING_DATA', false);
  }

  function currentEcgPayload(status) {
    return {
      status: status,
      savedAt: new Date().toISOString(),
      accession: getUiText('ecg-accession'),
      patientId: getUiText('ecg-patient-id'),
      firstName: getUiText('ecg-first-name'),
      lastName: getUiText('ecg-last-name'),
      age: getUiText('ecg-age'),
      dob: getUiText('ecg-dob'),
      gender: getUiText('ecg-gender'),
      performedAt: getUiText('ecg-performed-at'),
      interpretation: getUiText('ecg-interpretation')
    };
  }

  function saveEcg(status) {
    var payload = currentEcgPayload(status);
    var key = 'smart_ecg_' + (payload.accession || payload.patientId || 'current');

    logTroubleshooting('saving ECG state', {
      key: key,
      status: status,
      studyId: getCurrentStudyId()
    });

    try {
      if (window.localStorage) {
        window.localStorage.setItem(key, JSON.stringify(payload));
      }
      setSourceStatus(status);
      logTroubleshooting('ECG state saved', payload);
      return true;
    } catch (e) {
      if (window.console && typeof window.console.log === 'function') {
        window.console.log('[SMART ECG Viewer] unable to save ECG locally', e);
      }
      setSourceStatus('Save failed');
      return false;
    }
  }

  function attachActions() {
    var printButton = byId('smart-ecg-print');
    var editButton = byId('smart-ecg-edit');
    var saveButton = byId('smart-ecg-save');
    var signButton = byId('smart-ecg-sign');
    var closeButton = byId('smart-ecg-close');
    var detailsPanel = document.querySelector ? document.querySelector('.smart-ecg-details') : null;
    var interpretation = byId('ecg-interpretation');
    var suggestions = byId('smart-ecg-suggestions');

    if (printButton) {
      printButton.onclick = function() {
        logTroubleshooting('print button clicked', {
          studyId: getCurrentStudyId()
        });
        window.print();
      };
    }

    if (editButton) {
      editButton.onclick = function() {
        logTroubleshooting('edit button clicked', {
          studyId: getCurrentStudyId(),
          currentlyEditing: bodyHasClass('smart-ecg-editing')
        });
        setEditMode(!bodyHasClass('smart-ecg-editing'));
      };
    }

    if (saveButton) {
      saveButton.onclick = function() {
        logTroubleshooting('top save button clicked', {
          studyId: getCurrentStudyId()
        });
        if (saveEcg('Saved')) {
          clearPendingData();
          sendCardiologyViewerEvent('STUDY_COMPLETED', '');
        }
      };
    }

    if (signButton) {
      signButton.onclick = function() {
        logTroubleshooting('top sign button clicked', {
          studyId: getCurrentStudyId()
        });
        if (saveEcg('Signed')) {
          clearPendingData();
          sendCardiologyViewerEvent('STUDY_COMPLETED', '');
          setEditMode(false);
          setSourceStatus('Signed');
        }
      };
    }

    if (closeButton) {
      closeButton.onclick = function() {
        logTroubleshooting('viewer close button clicked', {
          studyId: getCurrentStudyId()
        });
        sendCardiologyViewerEvent('VIEWER_CLOSE', '');
      };
    }

    if (detailsPanel && typeof detailsPanel.addEventListener === 'function') {
      detailsPanel.addEventListener('input', markPendingData);
      detailsPanel.addEventListener('change', markPendingData);
    }

    if (interpretation && typeof interpretation.addEventListener === 'function') {
      interpretation.addEventListener('input', showInterpretationSuggestions);
      interpretation.addEventListener('focus', showInterpretationSuggestions);
      interpretation.addEventListener('blur', function() {
        window.setTimeout(hideInterpretationSuggestions, 160);
      });
    }

    if (suggestions && typeof suggestions.addEventListener === 'function') {
      suggestions.addEventListener('mousedown', function(event) {
        var target = event.target || event.srcElement;
        if (target && target.getAttribute && target.getAttribute('data-suggestion')) {
          event.preventDefault();
          insertInterpretationSuggestion(target.getAttribute('data-suggestion'));
        }
      });
    }
  }

  function findActionTarget(target, attributeName) {
    while (target && target !== document.body) {
      if (target.getAttribute && target.getAttribute(attributeName) !== null) {
        return target;
      }
      target = target.parentNode;
    }

    return null;
  }

  function elementHasClass(node, className) {
    return !!(node && typeof node.className === 'string' &&
      (' ' + node.className + ' ').indexOf(' ' + className + ' ') > -1);
  }

  function selectStudyMatchRow(index) {
    var rows = document.querySelectorAll ? document.querySelectorAll('.study-match-result-row') : [];
    var i;

    for (i = 0; i < rows.length; i += 1) {
      rows[i].className = rows[i].className.replace(/\s*is-selected/g, '');
      if (i === index) {
        rows[i].className += ' is-selected';
      }
    }
  }

  function closeStudyMatchMenu() {
    var menu = byId('study-match-menu');
    if (menu) {
      menu.setAttribute('hidden', 'hidden');
    }
  }

  function openStudyMatchMenu(index, button) {
    var menu = byId('study-match-menu');
    var rect;
    var right;

    if (!menu || !button || !button.getBoundingClientRect) {
      return;
    }

    selectStudyMatchRow(index);
    rect = button.getBoundingClientRect();
    right = Math.max(2, window.innerWidth - rect.right + 4);
    menu.setAttribute('data-study-index', String(index));
    menu.style.top = Math.max(3.6, rect.top - 8) + 'px';
    menu.style.right = right + 'px';
    menu.removeAttribute('hidden');
  }

  function openStudyMatchOrderSearch(context, studyIndex) {
    var overlay = byId('study-match-order-overlay');
    var reconcileOverlay = byId('study-match-reconcile-overlay');

    closeStudyMatchMenu();
    selectStudyMatchRow(studyIndex);

    if (reconcileOverlay) {
      reconcileOverlay.setAttribute('hidden', 'hidden');
      reconcileOverlay.innerHTML = '';
    }

    if (overlay) {
      overlay.innerHTML = studyMatchOrderOverlayHtml(context, studyIndex);
      overlay.setAttribute('data-study-index', String(studyIndex));
      overlay.removeAttribute('hidden');
    }
  }

  function closeStudyMatchOrderSearch() {
    var overlay = byId('study-match-order-overlay');
    if (overlay) {
      overlay.setAttribute('hidden', 'hidden');
      overlay.innerHTML = '';
    }
  }

  function openStudyMatchReconcile(context, studyIndex, orderIndex) {
    var orderOverlay = byId('study-match-order-overlay');
    var reconcileOverlay = byId('study-match-reconcile-overlay');

    closeStudyMatchOrderSearch();

    if (orderOverlay) {
      orderOverlay.setAttribute('hidden', 'hidden');
    }

    if (reconcileOverlay) {
      reconcileOverlay.innerHTML = studyMatchReconcileOverlayHtml(context, studyIndex, orderIndex);
      reconcileOverlay.setAttribute('data-study-index', String(studyIndex));
      reconcileOverlay.setAttribute('data-order-index', String(orderIndex));
      reconcileOverlay.removeAttribute('hidden');
    }
  }

  function closeStudyMatchReconcile() {
    var overlay = byId('study-match-reconcile-overlay');
    if (overlay) {
      overlay.setAttribute('hidden', 'hidden');
      overlay.innerHTML = '';
    }
  }

  function saveAndPromoteStudyMatch(context, studyIndex, orderIndex) {
    var study = context.studies[studyIndex] || context.studies[0];
    var order = context.orders[orderIndex] || context.orders[0];
    var payload = {
      workflow: 'study-match',
      patientId: context.patientId,
      studyDatePerformed: study.datePerformed,
      studyLocation: study.location,
      orderNumber: order.orderNumber,
      orderDate: order.date,
      orderStatus: order.status,
      modality: order.modality
    };

    setCurrentStudyId(order.orderNumber || study.location || context.patientId);
    sendCardiologyViewerEvent('STUDY_COMPLETED', payload);
    closeStudyMatchReconcile();
  }

  function attachStudyMatchActions(context) {
    var app = byId('study-match-app');

    if (!app) {
      return;
    }

    app.onclick = function(event) {
      var target = event.target || event.srcElement;
      var rowAction = findActionTarget(target, 'data-study-action');
      var menuAction = findActionTarget(target, 'data-menu-action');
      var dialogAction = findActionTarget(target, 'data-dialog-action');
      var orderAction = findActionTarget(target, 'data-order-index');
      var menu = byId('study-match-menu');
      var studyIndex;
      var orderIndex;

      if (rowAction) {
        studyIndex = parseInt(rowAction.getAttribute('data-study-index'), 10) || 0;
        openStudyMatchMenu(studyIndex, rowAction);
        return;
      }

      if (menuAction) {
        studyIndex = menu ? parseInt(menu.getAttribute('data-study-index'), 10) || 0 : 0;
        if (menuAction.getAttribute('data-menu-action') === 'reconcile-by-id') {
          openStudyMatchOrderSearch(context, studyIndex);
        } else {
          closeStudyMatchMenu();
        }
        return;
      }

      if (dialogAction) {
        if (dialogAction.getAttribute('data-dialog-action') === 'close-order') {
          closeStudyMatchOrderSearch();
          return;
        }

        if (dialogAction.getAttribute('data-dialog-action') === 'cancel-reconcile') {
          closeStudyMatchReconcile();
          return;
        }

        if (dialogAction.getAttribute('data-dialog-action') === 'save-promote') {
          studyIndex = parseInt(byId('study-match-reconcile-overlay').getAttribute('data-study-index'), 10) || 0;
          orderIndex = parseInt(dialogAction.getAttribute('data-order-index'), 10) || 0;
          saveAndPromoteStudyMatch(context, studyIndex, orderIndex);
          return;
        }
      }

      if (orderAction && elementHasClass(orderAction, 'study-match-select-order')) {
        studyIndex = parseInt(byId('study-match-order-overlay').getAttribute('data-study-index'), 10) || 0;
        orderIndex = parseInt(orderAction.getAttribute('data-order-index'), 10) || 0;
        openStudyMatchReconcile(context, studyIndex, orderIndex);
      }
    };
  }

  function drawStudyMatchWorkflow(context) {
    installStyles();
    document.body.className = (document.body.className + ' smart-ecg-body').replace(/\s+/g, ' ');
    document.body.innerHTML = studyMatchInboxHtml(context);
    setCurrentStudyId(context.patientId);
    attachStudyMatchActions(context);
  }

  window.drawVisualization = function(p) {
    var patient = p || defaultPatient();

    if (patient.workflow === 'study-match') {
      drawStudyMatchWorkflow(patient);
      return;
    }

    installStyles();
    document.body.className = (document.body.className + ' smart-ecg-body').replace(/\s+/g, ' ');
    document.body.innerHTML = shellHtml();
    renderPatient(patient);
    drawEcgChart();
    attachActions();
  };

})(window, document);
