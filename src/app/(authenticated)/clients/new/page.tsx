/**
 * New Client Page
 */

import { NewClientForm } from './NewClientForm';
import styles from '../clients.module.css';

export default function NewClientPage() {
  return (
    <>
      <h1 className={styles.title}>New Client</h1>
      <NewClientForm />
    </>
  );
}
