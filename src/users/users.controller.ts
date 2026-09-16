import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
} from '@nestjs/common';
import {
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '../../generated/prisma';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserQueryDto } from './dto/user-query.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { UsersService } from './users.service';

interface AuthenticatedUser {
  id: string;
  role: Role;
}

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @Roles(Role.ADMIN)
  @ApiOkResponse({ type: [UserResponseDto] })
  findAll(@Query() query: UserQueryDto) {
    return this.users.findAll(query);
  }

  @Get(':id')
  @ApiOkResponse({ type: UserResponseDto })
  @ApiForbiddenResponse()
  @ApiNotFoundResponse()
  findById(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    this.assertOwnerOrAdmin(id, currentUser);
    return this.users.findById(id);
  }

  @Patch(':id')
  @ApiOkResponse({ type: UserResponseDto })
  @ApiForbiddenResponse()
  @ApiNotFoundResponse()
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    this.assertOwnerOrAdmin(id, currentUser);
    return this.users.update(id, dto, currentUser);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiOkResponse({ type: UserResponseDto })
  @ApiNotFoundResponse()
  softDelete(@Param('id', ParseUUIDPipe) id: string) {
    return this.users.softDelete(id);
  }

  private assertOwnerOrAdmin(id: string, currentUser: AuthenticatedUser) {
    if (currentUser.role !== Role.ADMIN && currentUser.id !== id) {
      throw new ForbiddenException('You can only access your own user record');
    }
  }
}
