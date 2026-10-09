(function(window, document) {
  'use strict';

  var SVG_NS = 'http://www.w3.org/2000/svg';
  var WIDTH = 1200;
  var HEIGHT = 680;
  var STYLE_ID = 'smart-ecg-styles';

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

  function getStudyId() {
    return getQueryParam('studyId') ||
      getQueryParam('studyID') ||
      getQueryParam('study_id') ||
      getQueryParam('studyIdentifier') ||
      getQueryParam('study_identifier') ||
      getQueryParam('cerner_accession') ||
      getQueryParam('cerner_studyIdentifier') ||
      getQueryParam('cerner_study_identifier') ||
      getQueryParam('__accession') ||
      getQueryParam('__studyIdentifier') ||
      getQueryParam('__study_identifier') ||
      getQueryParam('accession') ||
      getQueryParam('accessionNumber') ||
      getQueryParam('accession_number') ||
      safeSessionItem('smart_ecg_study_id') ||
      '';
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
      sourceStatus: 'Demo ECG',
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
    var patientId = getPrimaryIdentifier(patient);
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
      { type: 'DiagnosticReport', query: { accession: studyId } },
      { type: 'Observation', query: { identifier: studyId } },
      { type: 'Observation', query: { _id: studyId } },
      { type: 'ImagingStudy', query: { accession: studyId } },
      { type: 'ImagingStudy', query: { identifier: studyId } },
      { type: 'ImagingStudy', query: { uid: studyId } },
      { type: 'ImagingStudy', query: { _id: studyId } },
      { type: 'DocumentReference', query: { identifier: studyId } },
      { type: 'DocumentReference', query: { _id: studyId } }
    ];
  }

  function searchStudyResource(smart, studyId) {
    var ret = makeDeferred();
    var attempts = getStudySearchAttempts(studyId);
    var api = smart && smart.api;

    function next(index) {
      var attempt;

      if (!api || typeof api.fetchAll !== 'function') {
        ret.reject('FHIR search is not available');
        return;
      }

      if (index >= attempts.length) {
        ret.reject('No FHIR study resource found for study id ' + studyId);
        return;
      }

      attempt = attempts[index];
      try {
        toDeferred(api.fetchAll({
          type: attempt.type,
          query: attempt.query
        })).done(function(result) {
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
    var api = smart && smart.api;

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
      type: 'Observation',
      patient: patientId || undefined,
      query: {
        code: {
          $or: [
            'http://loinc.org|8302-2',
            'http://loinc.org|8462-4',
            'http://loinc.org|8480-6',
            'http://loinc.org|2085-9',
            'http://loinc.org|2089-1',
            'http://loinc.org|55284-4'
          ]
        }
      }
    });
  }

  function readPatientById(smart, patientId) {
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
    var patientId = smart && smart.patient ? smart.patient.id : '';

    whenTwo(
      smart.patient.read(),
      fetchObservationsForPatient(smart, patientId),
      function(patient, observations) {
        ret.resolve(normalizePatient(patient, observations || [], { studyId: studyId }));
      },
      function(error) {
        ret.reject(error);
      }
    );

    return ret.promise();
  }

  function failToDemo(ret, reason) {
    var demo = defaultPatient();
    if (reason) {
      demo.sourceStatus = reason;
    }
    ret.resolve(demo);
  }

  window.extractData = function() {
    var ret = makeDeferred();

    setPvFrameworkPendingData(2);

    if (!window.FHIR ||
        !window.FHIR.oauth2 ||
        typeof window.FHIR.oauth2.ready !== 'function') {
      failToDemo(ret, 'Demo ECG');
      return ret.promise();
    }

    if (!hasSmartContext()) {
      failToDemo(ret, 'Demo ECG');
      return ret.promise();
    }

    try {
      window.FHIR.oauth2.ready(function(smart) {
        var studyId = getStudyId();

        setPvFrameworkPendingData(1);

        if (!smart) {
          failToDemo(ret, 'SMART launch unavailable');
          return;
        }

        if (smart.patient && typeof smart.patient.read === 'function') {
          readPatientFromLaunchContext(smart, studyId).done(function(patient) {
            ret.resolve(patient);
          }).fail(function(error) {
            if (window.console && typeof window.console.log === 'function') {
              window.console.log('FHIR patient read failed; showing demo ECG', error);
            }
            failToDemo(ret, 'Demo ECG');
          });
          return;
        }

        if (studyId) {
          readPatientFromStudyId(smart, studyId).done(function(patient) {
            ret.resolve(patient);
          }).fail(function(error) {
            if (window.console && typeof window.console.log === 'function') {
              window.console.log('Study lookup failed; showing demo ECG', error);
            }
            failToDemo(ret, 'Study not found');
          });
          return;
        }

        failToDemo(ret, 'SMART launch without patient context');
      }, function(error) {
        if (window.console && typeof window.console.log === 'function') {
          window.console.log('SMART launch failed; showing demo ECG', error);
        }
        failToDemo(ret, 'Demo ECG');
      });
    } catch (e) {
      if (window.console && typeof window.console.log === 'function') {
        window.console.log('SMART launch exception; showing demo ECG', e);
      }
      failToDemo(ret, 'Demo ECG');
    }

    return ret.promise();
  };

  function cssText() {
    return [
      'html, body { height: 100%; }',
      'body.smart-ecg-body { margin: 0; background: #eef1f5; color: #202833; font-family: Arial, Helvetica, sans-serif; overflow: hidden; }',
      '.smart-ecg-app, .smart-ecg-app * { box-sizing: border-box; }',
      '.smart-ecg-app { display: -ms-grid; display: grid; -ms-grid-columns: minmax(680px, 1fr) 32rem; grid-template-columns: minmax(680px, 1fr) 32rem; height: 100vh; min-height: 640px; background: #fff; }',
      '.smart-ecg-viewer { display: -ms-grid; display: grid; -ms-grid-rows: 3rem 2.25rem minmax(0, 1fr); grid-template-rows: 3rem 2.25rem minmax(0, 1fr); min-width: 0; border-right: 1px solid #9aa5b4; }',
      '.smart-ecg-metrics { display: flex; align-items: stretch; min-width: 0; overflow: hidden; background: #f4f6f8; border-bottom: 1px solid #ccd2da; }',
      '.smart-ecg-metric { min-width: 4.5rem; padding: .34rem .45rem; border-right: 1px solid #d9dee5; line-height: 1.05; }',
      '.smart-ecg-metric-label { display: block; color: #5f6b7a; font-size: .7rem; font-weight: 700; }',
      '.smart-ecg-metric-value { display: block; margin-top: .12rem; color: #1d2733; font-size: .86rem; font-weight: 800; }',
      '.smart-ecg-metric.smart-ecg-severity { min-width: 7.25rem; background: #eef1f5; }',
      '.smart-ecg-toolbar { display: flex; align-items: center; gap: .18rem; padding: .18rem .35rem; background: #fff; border-bottom: 1px solid #d3d8df; }',
      '.smart-ecg-button { display: inline-flex; align-items: center; justify-content: center; width: 1.75rem; height: 1.75rem; padding: 0; color: #1f2d3d; background: #fff; border: 1px solid transparent; border-radius: 4px; font: inherit; cursor: default; }',
      '.smart-ecg-button:hover { background: #edf2f9; border-color: #c9d3e2; }',
      '.smart-ecg-toolbar-spacer { flex: 1 1 auto; }',
      '.smart-ecg-scale { color: #0d45bf; font-size: .9rem; font-weight: 800; }',
      '.smart-ecg-stage { position: relative; min-width: 0; overflow: hidden; background-color: #fff9f8; background-image: linear-gradient(rgba(230,73,73,.18) 1px, transparent 1px), linear-gradient(90deg, rgba(230,73,73,.18) 1px, transparent 1px), linear-gradient(rgba(210,48,48,.35) 2px, transparent 2px), linear-gradient(90deg, rgba(210,48,48,.35) 2px, transparent 2px); background-size: 8px 8px, 8px 8px, 40px 40px, 40px 40px; }',
      '.smart-ecg-svg { position: absolute; inset: 0; width: 100%; height: 100%; }',
      '.smart-ecg-line { fill: none; stroke: #24292f; stroke-width: 1.75; stroke-linecap: round; stroke-linejoin: round; }',
      '.smart-ecg-lead-label, .smart-ecg-paper-caption { fill: #0d45bf; font-size: 13px; font-weight: 800; }',
      '.smart-ecg-lead-marker, .smart-ecg-calibration { fill: none; stroke: #0d45bf; stroke-width: 3; stroke-linecap: square; stroke-linejoin: miter; }',
      '.smart-ecg-details { display: -ms-grid; display: grid; -ms-grid-rows: 2.75rem auto minmax(0, 1fr); grid-template-rows: 2.75rem auto minmax(0, 1fr); min-width: 0; background: #f7f8fa; }',
      '.smart-ecg-topbar { display: flex; align-items: center; min-width: 0; padding: 0 .5rem 0 1rem; color: #fff; background: #254f9f; }',
      '.smart-ecg-title { flex: 1 1 auto; min-width: 0; overflow: hidden; text-align: center; text-overflow: ellipsis; white-space: nowrap; font-size: .95rem; font-weight: 800; }',
      '.smart-ecg-actions { display: flex; gap: .2rem; }',
      '.smart-ecg-actions .smart-ecg-button { color: #fff; background: transparent; }',
      '.smart-ecg-actions .smart-ecg-button:hover { background: rgba(255,255,255,.14); border-color: rgba(255,255,255,.22); }',
      '.smart-ecg-command { width: auto; min-width: 4rem; padding: 0 .65rem; gap: .3rem; color: #fff; border-color: rgba(255,255,255,.22); font-size: .76rem; font-weight: 800; }',
      '.smart-ecg-command.smart-ecg-sign { background: rgba(37, 111, 58, .9); }',
      '.smart-ecg-command.smart-ecg-save-action { background: rgba(255,255,255,.12); }',
      'body.smart-ecg-editing .smart-ecg-interpretation { outline: 2px solid #88b7ff; background: #fff; }',
      '.smart-ecg-patient-grid { display: grid; grid-template-columns: repeat(9, minmax(0, 1fr)); gap: 0; padding: .75rem .65rem .55rem; background: #fff; border-bottom: 1px solid #d4d9e1; }',
      '.smart-ecg-field { min-width: 0; min-height: 2.35rem; padding: 0 .48rem; border-right: 1px solid #e0e4ea; }',
      '.smart-ecg-field:last-child { border-right: 0; }',
      '.smart-ecg-field.smart-ecg-span-2 { grid-column: span 2; }',
      '.smart-ecg-field-label { display: block; margin-bottom: .25rem; overflow: hidden; color: #818b98; text-overflow: ellipsis; white-space: nowrap; font-size: .74rem; font-weight: 800; }',
      '.smart-ecg-field-value { display: block; overflow-wrap: anywhere; color: #222a35; font-size: .78rem; font-weight: 800; }',
      '.smart-ecg-scroll { min-height: 0; overflow: auto; padding-bottom: .8rem; }',
      '.smart-ecg-section-title { display: flex; align-items: center; height: 1.38rem; padding: 0 .5rem; color: #1e2b38; background: #d6d9de; border-top: 1px solid #b5bcc7; border-bottom: 1px solid #b5bcc7; font-size: .82rem; font-weight: 800; }',
      '.smart-ecg-section-title svg { margin-right: .28rem; }',
      '.smart-ecg-box { margin: .48rem .55rem; background: #fff; border: 1px solid #9da9b8; }',
      '.smart-ecg-data-grid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); }',
      '.smart-ecg-data-grid.smart-ecg-two { grid-template-columns: repeat(2, minmax(0, 1fr)); }',
      '.smart-ecg-data-grid.smart-ecg-one { grid-template-columns: 1fr; }',
      '.smart-ecg-cell { min-height: 2.85rem; padding: .55rem .5rem; border-right: 1px solid #e1e5eb; border-bottom: 1px solid #e1e5eb; }',
      '.smart-ecg-cell:last-child { border-right: 0; }',
      '.smart-ecg-cell-label { display: block; margin-bottom: .3rem; color: #8993a1; font-size: .76rem; font-weight: 800; }',
      '.smart-ecg-cell-value { display: block; overflow-wrap: anywhere; color: #202833; font-size: .8rem; font-weight: 800; }',
      '.smart-ecg-interpretation { padding: .75rem .78rem 1.2rem; font-size: .78rem; font-weight: 800; line-height: 1.45; white-space: pre-line; }',
      '.smart-ecg-save { position: fixed; right: 1.1rem; bottom: 1.15rem; display: inline-flex; align-items: center; justify-content: center; width: 3rem; height: 3rem; color: #0d2448; background: #88b7ff; border: 0; border-radius: 50%; box-shadow: 0 .35rem 1rem rgba(21,49,91,.28); }',
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
      '</div>',
      '<div class="smart-ecg-stage">',
      '<svg id="smart-ecg-chart" class="smart-ecg-svg" viewBox="0 0 1200 680" preserveAspectRatio="none" role="img" aria-label="Twelve lead ECG waveform"></svg>',
      '</div>',
      '</section>',
      '<aside class="smart-ecg-details" aria-label="ECG details">',
      '<div class="smart-ecg-topbar">',
      '<div class="smart-ecg-title" id="ecg-source-status">Unconfirmed</div>',
      '<div class="smart-ecg-actions">',
      '<button class="smart-ecg-button" type="button" title="Copy link" aria-label="Copy link">', icon('link'), '</button>',
      '<button class="smart-ecg-button" id="smart-ecg-print" type="button" title="Print" aria-label="Print">', icon('print'), '</button>',
      '<button class="smart-ecg-button" id="smart-ecg-edit" type="button" title="Edit interpretation" aria-label="Edit interpretation">', icon('edit'), '</button>',
      '<button class="smart-ecg-button smart-ecg-command smart-ecg-save-action" id="smart-ecg-save" type="button" title="Save ECG" aria-label="Save ECG">Save</button>',
      '<button class="smart-ecg-button smart-ecg-command smart-ecg-sign" id="smart-ecg-sign" type="button" title="Sign ECG" aria-label="Sign ECG">Sign</button>',
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
      '<div class="smart-ecg-interpretation" id="ecg-interpretation"></div>',
      '</div>',
      '</aside>',
      '</div>',
      '<button class="smart-ecg-save" id="smart-ecg-floating-save" type="button" title="Save ECG" aria-label="Save ECG">', icon('save'), '</button>'
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
    setText('ecg-source-status', data.sourceStatus || 'Unconfirmed');
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
    setText('ecg-source-status', value);
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
    var interpretation = byId('ecg-interpretation');
    var editButton = byId('smart-ecg-edit');

    if (interpretation) {
      interpretation.contentEditable = enabled ? 'true' : 'false';
      if (enabled && typeof interpretation.focus === 'function') {
        interpretation.focus();
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

    try {
      if (window.localStorage) {
        window.localStorage.setItem(key, JSON.stringify(payload));
      }
      setSourceStatus(status);
      return true;
    } catch (e) {
      if (window.console && typeof window.console.log === 'function') {
        window.console.log('Unable to save ECG locally', e);
      }
      setSourceStatus('Save failed');
      return false;
    }
  }

  function attachActions() {
    var printButton = byId('smart-ecg-print');
    var editButton = byId('smart-ecg-edit');
    var saveButton = byId('smart-ecg-save');
    var floatingSaveButton = byId('smart-ecg-floating-save');
    var signButton = byId('smart-ecg-sign');

    if (printButton) {
      printButton.onclick = function() {
        window.print();
      };
    }

    if (editButton) {
      editButton.onclick = function() {
        setEditMode(!bodyHasClass('smart-ecg-editing'));
      };
    }

    if (saveButton) {
      saveButton.onclick = function() {
        saveEcg('Saved');
      };
    }

    if (floatingSaveButton) {
      floatingSaveButton.onclick = function() {
        saveEcg('Saved');
      };
    }

    if (signButton) {
      signButton.onclick = function() {
        if (saveEcg('Signed')) {
          setEditMode(false);
          setSourceStatus('Signed');
        }
      };
    }
  }

  window.drawVisualization = function(p) {
    var patient = p || defaultPatient();
    installStyles();
    document.body.className = (document.body.className + ' smart-ecg-body').replace(/\s+/g, ' ');
    document.body.innerHTML = shellHtml();
    renderPatient(patient);
    drawEcgChart();
    attachActions();
  };

})(window, document);
