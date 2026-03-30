const EventEmitter = require('events');

const KYC_EVENTS = Object.freeze({
  idUploaded: 'id_uploaded',
  selfieUploaded: 'selfie_uploaded',
  verificationApproved: 'verification_approved',
  verificationRejected: 'verification_rejected',
});

const emitter = new EventEmitter();
emitter.setMaxListeners(50);

function emitKycEvent(eventName, payload = {}) {
  setImmediate(() => {
    emitter.emit(eventName, {
      domain: 'kyc',
      event: eventName,
      schemaVersion: 1,
      ...payload,
      occurredAt: new Date().toISOString(),
    });
  });
}

function onKycEvent(eventName, listener) {
  emitter.on(eventName, listener);
  return () => emitter.off(eventName, listener);
}

module.exports = {
  KYC_EVENTS,
  emitKycEvent,
  onKycEvent,
};
