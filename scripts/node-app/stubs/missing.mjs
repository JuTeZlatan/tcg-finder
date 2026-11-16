// Modules de l'appli absents là où le code tourne sans les dépendances de l'appli (collecte quotidienne sur GitHub) :
// React, Firebase, ML Kit. Rien de tout cela ne sert aux listes de cartes ; ces remplaçants vides permettent seulement
// de charger les fichiers qui les importent.
const noop = () => {};
// react
export const createContext = (v) => ({ Provider: noop, _value: v });
export const createElement = noop;
export const useCallback = (f) => f;
export const useContext = (c) => c?._value;
export const useEffect = noop;
export const useMemo = (f) => f();
export const useRef = (v) => ({ current: v });
export const useState = (v) => [typeof v === 'function' ? v() : v, noop];
export default { createContext, createElement, useCallback, useContext, useEffect, useMemo, useRef, useState };
// firebase/app, firebase/firestore, firebase/auth
export const initializeApp = noop;
export const initializeFirestore = noop;
export const collection = noop;
export const doc = noop;
export const getDoc = async () => null;
export const getDocs = async () => ({ docs: [] });
export const setDoc = async () => {};
export const writeBatch = () => ({ set: noop, commit: async () => {} });
export class GoogleAuthProvider { static credential() { return null; } }
export const createUserWithEmailAndPassword = async () => null;
export const getReactNativePersistence = noop;
export const initializeAuth = () => ({});
export const onAuthStateChanged = () => noop;
export const sendEmailVerification = async () => {};
export const sendPasswordResetEmail = async () => {};
export const signInWithCredential = async () => null;
export const signInWithEmailAndPassword = async () => null;
export const signOut = async () => {};
// @infinitered/react-native-mlkit-text-recognition
export const recognizeText = async () => ({ blocks: [] });
