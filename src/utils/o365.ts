import { PublicClientApplication } from '@azure/msal-browser';
import type { Configuration, AccountInfo } from '@azure/msal-browser';
import type { Task, Consultant, O365Config } from '../types';

let msalInstance: PublicClientApplication | null = null;

/**
 * Initializes or retrieves the MSAL PublicClientApplication instance based on user settings.
 */
export function getMsalInstance(config: O365Config): PublicClientApplication | null {
  if (!config.clientId || !config.tenantId || !config.isEnabled) {
    msalInstance = null;
    return null;
  }

  const msalConfig: Configuration = {
    auth: {
      clientId: config.clientId,
      authority: `https://login.microsoftonline.com/${config.tenantId}`,
      redirectUri: config.redirectUri || window.location.origin,
    },
    cache: {
      cacheLocation: 'localStorage',
    },
  };

  if (!msalInstance || msalInstance.getConfiguration().auth.clientId !== config.clientId) {
    msalInstance = new PublicClientApplication(msalConfig);
    // Initialize async (MSAL.js v3 needs initialize() call)
    msalInstance.initialize().catch(err => {
      console.error('MSAL Initialization error:', err);
    });
  }

  return msalInstance;
}

/**
 * Gets Microsoft Graph Access Token
 */
export async function getAccessToken(config: O365Config, scopes: string[]): Promise<string | null> {
  const msal = getMsalInstance(config);
  if (!msal) return null;

  try {
    const accounts = msal.getAllAccounts();
    if (accounts.length === 0) {
      // Need login
      return null;
    }

    const silentResult = await msal.acquireTokenSilent({
      scopes,
      account: accounts[0]
    });
    return silentResult.accessToken;
  } catch (error) {
    console.warn('Acquire token silent failed, trying interactive popup:', error);
    try {
      const popupResult = await msal.acquireTokenPopup({
        scopes
      });
      return popupResult.accessToken;
    } catch (popupError) {
      console.error('Popup token acquisition failed:', popupError);
      return null;
    }
  }
}

/**
 * Microsoft Login
 */
export async function signInMicrosoft(config: O365Config): Promise<AccountInfo | null> {
  const msal = getMsalInstance(config);
  if (!msal) {
    throw new Error('MSAL has not been configured or enabled.');
  }

  try {
    const loginResponse = await msal.loginPopup({
      scopes: ['User.Read', 'Tasks.ReadWrite', 'Calendars.ReadWrite'],
      prompt: 'select_account'
    });
    return loginResponse.account;
  } catch (error) {
    console.error('Microsoft login failed:', error);
    throw error;
  }
}

/**
 * Microsoft Logout
 */
export async function signOutMicrosoft(config: O365Config): Promise<void> {
  const msal = getMsalInstance(config);
  if (!msal) return;

  try {
    const accounts = msal.getAllAccounts();
    if (accounts.length > 0) {
      await msal.logoutPopup({
        account: accounts[0],
        postLogoutRedirectUri: window.location.origin,
      });
    }
  } catch (error) {
    console.error('Microsoft logout failed:', error);
  }
}

/**
 * Microsoft Graph To-Do List Lookup or Creation
 */
async function getOrCreateTodoList(token: string, listName: string): Promise<string> {
  // 1. Fetch lists
  const listResponse = await fetch('https://graph.microsoft.com/v1.0/me/todo/lists', {
    headers: { Authorization: `Bearer ${token}` }
  });
  
  if (!listResponse.ok) {
    throw new Error('Failed to retrieve Microsoft To-Do lists');
  }
  
  const data = await listResponse.json();
  const existingList = data.value.find((l: any) => l.displayName.toLowerCase() === listName.toLowerCase());
  
  if (existingList) {
    return existingList.id;
  }
  
  // 2. Create list if not found
  const createResponse = await fetch('https://graph.microsoft.com/v1.0/me/todo/lists', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ displayName: listName })
  });
  
  if (!createResponse.ok) {
    throw new Error('Failed to create Microsoft To-Do list: ' + listName);
  }
  
  const newList = await createResponse.json();
  return newList.id;
}

/**
 * Creates/Syncs a Task on Microsoft To-Do list.
 * Fallbacks to Mock actions when not configured.
 */
export async function syncTaskToO365(
  task: Task, 
  config: O365Config,
  isMock: boolean = false
): Promise<{ success: boolean; taskId?: string; message: string }> {
  if (isMock || !config.isEnabled) {
    // Return mock success response
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          success: true,
          taskId: `mock-task-${Math.random().toString(36).substr(2, 9)}`,
          message: `[MOCK SYNC] Successfully created task "${task.name}" in MS To-Do folder "${config.todoListName}"!`
        });
      }, 1000);
    });
  }

  const token = await getAccessToken(config, ['Tasks.ReadWrite']);
  if (!token) {
    return { success: false, message: 'Not authenticated with Microsoft. Please sign in.' };
  }

  try {
    const listId = await getOrCreateTodoList(token, config.todoListName || 'Pinnacle Projects');
    
    const body = {
      title: task.name,
      body: {
        content: task.description || 'Synced from Pinnacle Projects.',
        contentType: 'text'
      },
      dueDateTime: task.plannedEndDate ? {
        dateTime: `${task.plannedEndDate}T17:00:00`,
        timeZone: 'UTC'
      } : undefined
    };

    let url = `https://graph.microsoft.com/v1.0/me/todo/lists/${listId}/tasks`;
    let method = 'POST';

    // If already has a synced ID, we update it instead of creating a duplicate
    if (task.o365TaskId) {
      url = `${url}/${task.o365TaskId}`;
      method = 'PATCH';
    }

    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errData = await response.json();
      throw new Error(errData.error?.message || 'Failed to sync task');
    }

    const resData = await response.json();
    return {
      success: true,
      taskId: resData.id,
      message: task.o365TaskId 
        ? `Task updated in MS To-Do folder "${config.todoListName}"!`
        : `Task created in MS To-Do folder "${config.todoListName}"!`
    };
  } catch (error: any) {
    console.error('Office 365 Task Sync Error:', error);
    return { success: false, message: error.message || 'Error communicating with Microsoft Graph API' };
  }
}

/**
 * Creates a Calendar Event in Outlook.
 * Fallbacks to Mock actions when not configured.
 */
export async function createOutlookCalendarEvent(
  task: Task,
  consultants: Consultant[],
  config: O365Config,
  eventOptions: {
    title: string;
    startTime: string; // e.g. "09:00"
    endTime: string;   // e.g. "17:00"
    description: string;
    sendInvites: boolean;
  },
  isMock: boolean = false
): Promise<{ success: boolean; eventId?: string; message: string }> {
  const startDay = task.plannedStartDate || new Date().toISOString().split('T')[0];
  const endDay = task.plannedEndDate || startDay;
  
  const startDateTime = `${startDay}T${eventOptions.startTime}:00`;
  const endDateTime = `${endDay}T${eventOptions.endTime}:00`;

  if (isMock || !config.isEnabled) {
    return new Promise((resolve) => {
      setTimeout(() => {
        const invitees = consultants.length > 0 ? consultants.map(c => c.name).join(', ') : 'None';
        resolve({
          success: true,
          eventId: `mock-event-${Math.random().toString(36).substr(2, 9)}`,
          message: `[MOCK CALENDAR] Event "${eventOptions.title}" scheduled successfully from ${startDateTime} to ${endDateTime}. Invitees: ${invitees}`
        });
      }, 1000);
    });
  }

  const token = await getAccessToken(config, ['Calendars.ReadWrite']);
  if (!token) {
    return { success: false, message: 'Not authenticated with Microsoft. Please sign in.' };
  }

  try {
    const attendees = consultants.map(c => ({
      emailAddress: {
        address: c.email,
        name: c.name
      },
      type: 'required'
    }));

    const eventBody = {
      subject: eventOptions.title,
      body: {
        contentType: 'HTML',
        content: `
          <p>${eventOptions.description}</p>
          <hr />
          <p><i>Scheduled automatically from Pinnacle Projects</i></p>
        `
      },
      start: {
        dateTime: startDateTime,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
      },
      end: {
        dateTime: endDateTime,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
      },
      attendees: eventOptions.sendInvites ? attendees : [],
      location: {
        displayName: 'Microsoft Teams Meeting / Client Site'
      },
      isOnlineMeeting: true,
      onlineMeetingProvider: 'teamsForBusiness'
    };

    const response = await fetch('https://graph.microsoft.com/v1.0/me/calendar/events', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(eventBody)
    });

    if (!response.ok) {
      const errData = await response.json();
      throw new Error(errData.error?.message || 'Failed to create calendar event');
    }

    const resData = await response.json();
    return {
      success: true,
      eventId: resData.id,
      message: `Calendar event "${eventOptions.title}" created successfully and synced to Outlook!`
    };
  } catch (error: any) {
    console.error('Office 365 Calendar Event Error:', error);
    return { success: false, message: error.message || 'Error communicating with Microsoft Graph API' };
  }
}
