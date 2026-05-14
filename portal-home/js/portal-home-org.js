/* portal-home-org.js | 조직/공개범위 로직 분리 */

function normalizePortalOrgValue(value) {
      return String(value || '').trim().replace(/\s+/g, '').toLowerCase();
    }

    function addPortalOrgValue(set, value) {
      const normalized = normalizePortalOrgValue(value);
      if (normalized) set.add(normalized);
    }

    function getPortalTeamValues(value) {
      const set = new Set();
      addPortalOrgValue(set, value);
      const target = normalizePortalOrgValue(value);
      if (!target) return set;

      (state.portalOrgTeams || []).forEach(team => {
        const candidates = [
          team.team_code,
          team.code,
          team.id,
          team.team_id,
          team.team_name,
          team.name,
          team.label
        ];
        if (candidates.some(item => normalizePortalOrgValue(item) === target)) {
          candidates.forEach(item => addPortalOrgValue(set, item));
        }
      });

      return set;
    }

    function getPortalTeamCandidateValues(team) {
      if (!team) return [];
      return [
        team.team_code,
        team.code,
        team.id,
        team.team_id,
        team.team_name,
        team.name,
        team.label
      ];
    }

    function getPortalDivisionCandidateValues(division) {
      if (!division) return [];
      return [
        division.division_code,
        division.code,
        division.id,
        division.value,
        division.division_name,
        division.name,
        division.label,
        division.department
      ];
    }

    function normalizePortalEmail(value) {
      return String(value || '').trim().toLowerCase();
    }

    function getPortalDivisionValues(value) {
      const set = new Set();
      addPortalOrgValue(set, value);
      const target = normalizePortalOrgValue(value);
      if (!target) return set;

      (state.portalOrgDivisions || []).forEach(division => {
        const candidates = getPortalDivisionCandidateValues(division);
        if (candidates.some(item => normalizePortalOrgValue(item) === target)) {
          candidates.forEach(item => addPortalOrgValue(set, item));
        }
      });

      (state.portalOrgTeams || []).forEach(team => {
        const teamCandidates = getPortalTeamCandidateValues(team);
        const divisionCandidates = [
          team.division_code,
          team.department_code,
          team.parent_division_code,
          team.division_name,
          team.department,
          team.division
        ];

        if (teamCandidates.some(item => normalizePortalOrgValue(item) === target)) {
          divisionCandidates.forEach(item => addPortalOrgValue(set, item));
        }

        if (divisionCandidates.some(item => normalizePortalOrgValue(item) === target)) {
          divisionCandidates.forEach(item => addPortalOrgValue(set, item));
        }
      });

      return set;
    }

    function portalSetsIntersect(aSet, bSet) {
      for (const value of aSet) {
        if (bSet.has(value)) return true;
      }
      return false;
    }

    function samePortalTeamValue(a, b) {
      const av = getPortalTeamValues(a);
      const bv = getPortalTeamValues(b);
      return av.size > 0 && bv.size > 0 && portalSetsIntersect(av, bv);
    }

    function samePortalDivisionValue(a, b) {
      const av = getPortalDivisionValues(a);
      const bv = getPortalDivisionValues(b);
      return av.size > 0 && bv.size > 0 && portalSetsIntersect(av, bv);
    }

    function findPortalTeamByValue(value) {
      const target = normalizePortalOrgValue(value);
      if (!target) return null;
      return (state.portalOrgTeams || []).find(team =>
        getPortalTeamCandidateValues(team).some(item => normalizePortalOrgValue(item) === target)
      ) || null;
    }

    function resolvePortalTeamDivisionValue(teamValue) {
      const team = findPortalTeamByValue(teamValue);
      if (!team) return '';
      return String(team.division_code || team.department_code || team.parent_division_code || team.division_name || team.department || team.division || '').trim();
    }

    function getPortalTeamCodeFromEmployee(employee) {
      if (!employee) return '';
      const direct = String(employee.team_code || employee.team_id || '').trim();
      if (direct) return direct;
      const teamName = String(employee.team || employee.team_name || '').trim();
      const team = findPortalTeamByValue(teamName);
      return String(team?.team_code || team?.code || teamName || '').trim();
    }

    function getPortalDivisionCodeFromEmployee(employee, teamCode) {
      if (!employee) return '';
      const direct = String(employee.division_code || '').trim();
      if (direct) return direct;

      const teamDivision = resolvePortalTeamDivisionValue(teamCode || employee.team_code || employee.team || employee.team_name);
      if (teamDivision) return teamDivision;

      const divisionName = String(employee.division_name || employee.division || '').trim();
      const matchedDivision = (state.portalOrgDivisions || []).find(division => [
        division.division_code,
        division.code,
        division.id,
        division.value,
        division.division_name,
        division.name,
        division.label
      ].some(item => normalizePortalOrgValue(item) === normalizePortalOrgValue(divisionName)));

      return String(matchedDivision?.division_code || matchedDivision?.code || divisionName || '').trim();
    }

    function isPortalAdminRole() {
      const p = portalAuth().profile;
      const roleValue = String(p?.role || p?.authority || '').trim().toLowerCase();
      return roleValue === 'admin' || roleValue === '관리자';
    }

    function getPortalEmployeeByEmail(email) {
      const target = normalizePortalEmail(email);
      if (!target) return null;

      if (state.portalUserEmployee && normalizePortalEmail(state.portalUserEmployee.email) === target) {
        return state.portalUserEmployee;
      }

      return (state.portalOrgEmployees || []).find(emp => normalizePortalEmail(emp.email) === target) || null;
    }

    function normalizePortalEmployeeOrg(employee) {
      if (!employee) return null;

      const teamCode = getPortalTeamCodeFromEmployee(employee);
      const divisionCode = getPortalDivisionCodeFromEmployee(employee, teamCode);
      const matchedTeam = findPortalTeamByValue(teamCode || employee.team || employee.team_code);
      const matchedDivision = (state.portalOrgDivisions || []).find(division => samePortalDivisionValue(
        division.division_code || division.division_name || division.name,
        divisionCode
      ));

      return {
        ...employee,
        role: employee.role || employee.authority || '',
        team_code: String(teamCode || employee.team_code || employee.team || '').trim(),
        division_code: String(divisionCode || employee.division_code || '').trim(),
        team_name: String(matchedTeam?.team_name || matchedTeam?.name || employee.team || employee.team_code || '').trim(),
        division_name: String(matchedDivision?.division_name || matchedDivision?.name || employee.division_code || '').trim()
      };
    }

    function getCurrentPortalAuthorOrg() {
      const me = normalizePortalEmployeeOrg(state.portalUserEmployee) || {};
      const teamCode = String(me.team_code || getPortalTeamCodeFromEmployee(state.portalUserEmployee) || '').trim();
      const divisionCode = String(
        me.division_code ||
        getPortalDivisionCodeFromEmployee(state.portalUserEmployee, teamCode) ||
        resolvePortalTeamDivisionValue(teamCode) ||
        ''
      ).trim();

      return {
        team_code: teamCode,
        division_code: divisionCode,
        team_name: String(me.team_name || state.portalUserEmployee?.team || state.portalUserEmployee?.team_name || '').trim(),
        division_name: String(me.division_name || state.portalUserEmployee?.division_name || state.portalUserEmployee?.division_code || '').trim()
      };
    }

    function getScheduleAuthorOrg(row) {
      const authorEmail = normalizePortalEmail(row?.created_by_email);
      const { meta } = unpackScheduleDescription(row?.description || '');

      // 새 DB 컬럼을 1순위로 사용하고, 기존 description 메타/직원조회는 fallback으로만 사용합니다.
      const columnTeam = String(row?.author_team_code || '').trim();
      const columnDiv = String(row?.author_division_code || '').trim();
      const columnTeamName = String(row?.author_team_name || '').trim();
      const columnDivName = String(row?.author_division_name || '').trim();

      const metaTeam = String(meta.author_team_code || '').trim();
      const metaDiv = String(meta.author_division_code || '').trim();

      const authorEmployee = getPortalEmployeeByEmail(authorEmail);
      const normalizedAuthor = normalizePortalEmployeeOrg(authorEmployee);

      const authorTeam = String(
        columnTeam ||
        metaTeam ||
        normalizedAuthor?.team_code ||
        normalizedAuthor?.team ||
        normalizedAuthor?.team_name ||
        ''
      ).trim();

      const authorDiv = String(
        columnDiv ||
        metaDiv ||
        normalizedAuthor?.division_code ||
        resolvePortalTeamDivisionValue(authorTeam) ||
        normalizedAuthor?.division_name ||
        ''
      ).trim();

      return {
        email: authorEmail,
        team: authorTeam,
        division: authorDiv,
        teamName: columnTeamName || normalizedAuthor?.team_name || normalizedAuthor?.team || '',
        divisionName: columnDivName || normalizedAuthor?.division_name || normalizedAuthor?.division_code || '',
        employee: normalizedAuthor
      };
    }

    function scheduleRowVisibleToCurrentUser(row) {
      if (!row) return false;

      const scope = normalizeScopeCode(row.scope);
      const email = normalizePortalEmail(portalAuth().email);
      const author = getScheduleAuthorOrg(row);

      // 전체 공개는 작성자 조직정보가 없어도 모든 사용자에게 표시
      if (scope === 'all') return true;

      // 개인 공개는 작성자 본인에게만 표시
      if (scope === 'personal') return Boolean(email && author.email === email);

      const me = normalizePortalEmployeeOrg(state.portalUserEmployee);
      const myTeam = String(me?.team_code || me?.team || '').trim();
      const myDiv = String(me?.division_code || resolvePortalTeamDivisionValue(myTeam) || '').trim();

      if (scope === 'team') {
        if (!author.team) return Boolean(email && author.email === email);

        // 새 컬럼 저장값은 정규화 문자열 직접 비교가 가장 안정적입니다.
        if (normalizePortalOrgValue(myTeam) && normalizePortalOrgValue(myTeam) === normalizePortalOrgValue(author.team)) return true;

        const visible = Boolean(myTeam && samePortalTeamValue(myTeam, author.team));
        if (!visible) {
          console.log('[portal-home] team scope hidden:', {
            title: row.title,
            myTeam,
            authorTeam: author.team,
            myEmail: email,
            authorEmail: author.email
          });
        }
        return visible;
      }

      if (scope === 'lab') {
        if (!author.division) return Boolean(email && author.email === email);

        // 새 컬럼 저장값은 정규화 문자열 직접 비교가 가장 안정적입니다.
        if (normalizePortalOrgValue(myDiv) && normalizePortalOrgValue(myDiv) === normalizePortalOrgValue(author.division)) return true;

        const visible = Boolean(myDiv && samePortalDivisionValue(myDiv, author.division));
        if (!visible) {
          console.log('[portal-home] lab scope hidden:', {
            title: row.title,
            myDiv,
            authorDiv: author.division,
            myEmail: email,
            authorEmail: author.email
          });
        }
        return visible;
      }

      return false;
    }

    function canMutateScheduleRow(row) {
      if (!row) return false;
      const email = String(portalAuth().email || '').trim().toLowerCase();
      const authorEmail = String(row.created_by_email || '').trim().toLowerCase();

      // 스케줄은 관리자 권한과 무관하게 작성자 본인만 수정/삭제/완료 처리 가능합니다.
      return Boolean(email && authorEmail === email);
    }

    function canMutateReservationRow(row) {
      if (!row) return false;
      const email = String(portalAuth().email || '').trim().toLowerCase();
      const authorEmail = String(row.created_by_email || '').trim().toLowerCase();
      if (authorEmail === email) return true;
      return isPortalAdminRole();
    }

    async function loadPortalUserEmployee() {
      try {
        const { sb, email } = portalAuth();
        if (!sb || !email) {
          state.portalUserEmployee = null;
          return;
        }

        const teamsResult = await sb.from('teams')
          .select('team_code,team_name,division_code,is_active,is_virtual');

        if (!teamsResult.error) {
          state.portalOrgTeams = (teamsResult.data || []).filter(team => team && team.is_active !== false);
        } else {
          console.warn('teams 조직정보 조회 실패:', teamsResult.error);
          state.portalOrgTeams = [];
        }

        try {
          const divisionsResult = await sb.from('divisions')
            .select('division_code,division_name,is_active');
          state.portalOrgDivisions = divisionsResult.error
            ? []
            : (divisionsResult.data || []).filter(division => division && division.is_active !== false);
          if (divisionsResult.error) console.warn('divisions 조직정보 조회 실패:', divisionsResult.error);
        } catch (divisionError) {
          console.warn('divisions 조직정보 조회 실패:', divisionError);
          state.portalOrgDivisions = [];
        }

        const employeeSelect = 'email,team,employee_no,name,authority,team_code,division_code';

        try {
          let allEmployeesResult = await sb.from('employees')
            .select(employeeSelect);

          if (allEmployeesResult.error && String(allEmployeesResult.error.message || '').includes('column')) {
            allEmployeesResult = await sb.from('employees')
              .select('email,team,employee_no,name,authority');
          }

          if (!allEmployeesResult.error) {
            state.portalOrgEmployees = (allEmployeesResult.data || [])
              .filter(emp => emp && emp.email)
              .map(emp => normalizePortalEmployeeOrg(emp));
          } else {
            console.warn('employees 전체 조직정보 조회 실패:', allEmployeesResult.error);
            state.portalOrgEmployees = [];
          }
        } catch (employeesError) {
          console.warn('employees 전체 조직정보 조회 실패:', employeesError);
          state.portalOrgEmployees = [];
        }

        let data = null;
        let result = await sb.from('employees')
          .select(employeeSelect)
          .eq('email', email)
          .maybeSingle();

        if (result.error && String(result.error.message || '').includes('column')) {
          result = await sb.from('employees')
            .select('email,team,employee_no,name,authority')
            .eq('email', email)
            .maybeSingle();
        }

        if (result.error) throw result.error;
        data = result.data;

        if (!data) {
          let alt = await sb.from('employees')
            .select(employeeSelect)
            .ilike('email', email)
            .maybeSingle();

          if (alt.error && String(alt.error.message || '').includes('column')) {
            alt = await sb.from('employees')
              .select('email,team,employee_no,name,authority')
              .ilike('email', email)
              .maybeSingle();
          }

          if (alt.error) throw alt.error;
          data = alt.data;
        }

        if (!data) {
          state.portalUserEmployee = null;
          return;
        }

        state.portalUserEmployee = normalizePortalEmployeeOrg(data);
        console.log('[portal-home] current employee org:', {
          email,
          team_code: state.portalUserEmployee?.team_code,
          division_code: state.portalUserEmployee?.division_code,
          team_name: state.portalUserEmployee?.team_name,
          division_name: state.portalUserEmployee?.division_name
        });

        if (state.portalUserEmployee && !getPortalEmployeeByEmail(state.portalUserEmployee.email)) {
          state.portalOrgEmployees = [
            ...(state.portalOrgEmployees || []),
            state.portalUserEmployee
          ];
        }
      } catch (e) {
        console.error('loadPortalUserEmployee', e);
        state.portalUserEmployee = null;
        state.portalOrgTeams = [];
        state.portalOrgDivisions = [];
        state.portalOrgEmployees = [];
      }
    }
